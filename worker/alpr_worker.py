"""
WatchTell ALPR Worker
---------------------
Runs as a systemd service on EC2 Spot instances.

Loop:
  1. Long-poll SQS queue (watchtell-alpr-queue) for ALPR jobs.
  2. For each job:
     a. Download the keyframe from S3.
     b. Run OpenALPR on the frame to extract plate candidates.
     c. Select the highest-confidence result.
     d. Publish a structured result message back to SQS for the Step Functions trigger.
     e. Delete the original job message.
  3. On Spot interruption notice (via TerminationWatcher), finish the current job
     and exit cleanly within the 2-minute window.

SQS message schema (inbound, from camera relay / Kinesis consumer):
  {
    "job_id":      "uuid",
    "camera_id":   "cam-01",
    "s3_key":      "keyframes/cam-01/2024-01-15T143200Z.jpg",
    "event_type":  "entry" | "exit" | "unknown",
    "recorded_at": "2024-01-15T14:32:00Z"
  }

SQS message schema (outbound, to pipeline trigger):
  {
    "job_id":       "uuid",
    "camera_id":    "cam-01",
    "s3_key":       "keyframes/...",
    "event_type":   "entry",
    "recorded_at":  "2024-01-15T14:32:00Z",
    "plate_number": "ABC1234",
    "confidence":   92.5,
    "region":       "us",
    "alpr_raw":     {...}
  }
"""
import json
import logging
import os
import signal
import sys
import tempfile
import threading
import uuid

import boto3
from openalpr import Alpr

from termination_watcher import TerminationWatcher

# ---------------------------------------------------------------------------
# Configuration (from environment, set via systemd EnvironmentFile or user-data)
# ---------------------------------------------------------------------------
QUEUE_URL = os.environ.get("ALPR_QUEUE_URL", "")
RESULT_QUEUE_URL = os.environ.get("RESULT_QUEUE_URL", QUEUE_URL)  # same queue; pipeline trigger reads it
AWS_REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
ALPR_COUNTRY = os.environ.get("ALPR_COUNTRY", "us")
ALPR_REGION = os.environ.get("ALPR_REGION", "")
ALPR_TOP_N = int(os.environ.get("ALPR_TOP_N", "5"))
SQS_WAIT_SECONDS = 20  # long-poll duration
SQS_MAX_MESSAGES = 1   # process one at a time for clean shutdown semantics

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("alpr-worker")

# ---------------------------------------------------------------------------
# AWS clients
# ---------------------------------------------------------------------------
sqs = boto3.client("sqs", region_name=AWS_REGION)
s3 = boto3.client("s3", region_name=AWS_REGION)


# ---------------------------------------------------------------------------
# OpenALPR initialisation
# ---------------------------------------------------------------------------

def init_alpr() -> Alpr:
    alpr = Alpr(ALPR_COUNTRY, "/etc/openalpr/openalpr.conf", "/usr/share/openalpr/runtime_data")
    if not alpr.is_loaded():
        logger.critical("OpenALPR failed to load — check installation.")
        sys.exit(1)
    alpr.set_top_n(ALPR_TOP_N)
    if ALPR_REGION:
        alpr.set_default_region(ALPR_REGION)
    logger.info("OpenALPR loaded (country=%s, top_n=%d)", ALPR_COUNTRY, ALPR_TOP_N)
    return alpr


# ---------------------------------------------------------------------------
# Job processing
# ---------------------------------------------------------------------------

def download_frame(bucket: str, key: str, dest: str) -> None:
    logger.info("Downloading s3://%s/%s", bucket, key)
    s3.download_file(bucket, key, dest)


def run_alpr(alpr: Alpr, image_path: str) -> dict:
    results = alpr.recognize_file(image_path)
    return results


def best_plate(alpr_results: dict) -> tuple[str, float] | tuple[None, None]:
    """Return (plate_number, confidence) for the highest-confidence result."""
    best: tuple[str, float] | tuple[None, None] = (None, None)
    for plate_group in alpr_results.get("results", []):
        for candidate in plate_group.get("candidates", []):
            if best[1] is None or candidate["confidence"] > best[1]:
                best = (candidate["plate"], candidate["confidence"])
    return best


def process_job(alpr: Alpr, message: dict) -> None:
    body = json.loads(message["Body"])
    job_id = body.get("job_id", str(uuid.uuid4()))
    camera_id = body["camera_id"]
    s3_uri = body["s3_key"]  # e.g. "keyframes/cam-01/frame.jpg"
    event_type = body.get("event_type", "unknown")
    recorded_at = body.get("recorded_at", "")

    # Parse bucket and key from s3_key (may be full s3:// URI or just a key)
    if s3_uri.startswith("s3://"):
        _, _, rest = s3_uri.partition("s3://")
        bucket, _, key = rest.partition("/")
    else:
        bucket = os.environ.get("MEDIA_BUCKET", "")
        key = s3_uri

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=True) as tmp:
        download_frame(bucket, key, tmp.name)
        alpr_results = run_alpr(alpr, tmp.name)

    plate_number, confidence = best_plate(alpr_results)
    if plate_number:
        logger.info("Detected plate: %s (%.1f%%) [job=%s, camera=%s]",
                    plate_number, confidence, job_id, camera_id)
    else:
        logger.info("No plate detected [job=%s, camera=%s]", job_id, camera_id)
        plate_number = "UNKNOWN"
        confidence = 0.0

    result = {
        "job_id": job_id,
        "camera_id": camera_id,
        "s3_key": s3_uri,
        "event_type": event_type,
        "recorded_at": recorded_at,
        "plate_number": plate_number,
        "confidence": confidence,
        "region": alpr_results.get("region_of_interest", {}).get("name", ""),
        "alpr_raw": alpr_results,
    }

    # Publish result so the Step Functions trigger Lambda picks it up
    sqs.send_message(
        QueueUrl=RESULT_QUEUE_URL,
        MessageBody=json.dumps(result),
        MessageGroupId=camera_id if "fifo" in RESULT_QUEUE_URL else None or "default",
    )

    # Delete the job message now that we've published a result
    sqs.delete_message(
        QueueUrl=QUEUE_URL,
        ReceiptHandle=message["ReceiptHandle"],
    )
    logger.info("Job %s complete.", job_id)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    shutdown_event = threading.Event()

    # Graceful shutdown on SIGTERM / SIGINT
    def _handle_signal(signum, _frame):
        logger.info("Received signal %d — initiating graceful shutdown.", signum)
        shutdown_event.set()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    # Start Spot interruption watcher in background
    watcher = TerminationWatcher(shutdown_event)
    watcher.start()

    alpr = init_alpr()

    logger.info("Worker started. Polling queue: %s", QUEUE_URL)

    try:
        while not shutdown_event.is_set():
            resp = sqs.receive_message(
                QueueUrl=QUEUE_URL,
                MaxNumberOfMessages=SQS_MAX_MESSAGES,
                WaitTimeSeconds=SQS_WAIT_SECONDS,
                AttributeNames=["All"],
            )
            messages = resp.get("Messages", [])
            if not messages:
                continue

            for message in messages:
                if shutdown_event.is_set():
                    # Return message to queue so another instance picks it up
                    logger.info("Shutdown flagged — returning message to queue.")
                    sqs.change_message_visibility(
                        QueueUrl=QUEUE_URL,
                        ReceiptHandle=message["ReceiptHandle"],
                        VisibilityTimeout=0,
                    )
                    break
                try:
                    process_job(alpr, message)
                except Exception as exc:
                    logger.exception("Failed to process job: %s", exc)
                    # Let visibility timeout expire naturally — SQS will redeliver
    finally:
        alpr.unload()
        logger.info("OpenALPR unloaded. Worker exiting.")


if __name__ == "__main__":
    if not QUEUE_URL:
        logger.critical("ALPR_QUEUE_URL environment variable is not set.")
        sys.exit(1)
    main()
