"""
Polls EC2 instance metadata (IMDSv2) every 5 seconds for a Spot interruption notice.
When a notice is detected, sets the shared shutdown_event so the main worker loop
can finish its current job and exit cleanly within the 2-minute window.
"""
import logging
import threading
import time

import requests

logger = logging.getLogger(__name__)

IMDS_BASE = "http://169.254.169.254"
TOKEN_TTL = 21600  # seconds (6 hours — refreshed well before expiry)
POLL_INTERVAL = 5  # seconds between metadata checks


class TerminationWatcher(threading.Thread):
    """Background thread that watches for EC2 Spot interruption notices."""

    def __init__(self, shutdown_event: threading.Event) -> None:
        super().__init__(daemon=True, name="termination-watcher")
        self._shutdown_event = shutdown_event
        self._imds_token: str | None = None
        self._token_expiry: float = 0.0

    # ------------------------------------------------------------------
    # IMDSv2 helpers
    # ------------------------------------------------------------------

    def _refresh_token(self) -> str:
        """Request a fresh IMDSv2 session token."""
        resp = requests.put(
            f"{IMDS_BASE}/latest/api/token",
            headers={"X-aws-ec2-metadata-token-ttl-seconds": str(TOKEN_TTL)},
            timeout=2,
        )
        resp.raise_for_status()
        self._imds_token = resp.text.strip()
        self._token_expiry = time.monotonic() + TOKEN_TTL - 300  # refresh 5 min early
        return self._imds_token

    def _get_token(self) -> str:
        if self._imds_token is None or time.monotonic() >= self._token_expiry:
            self._refresh_token()
        return self._imds_token  # type: ignore[return-value]

    def _get_metadata(self, path: str) -> requests.Response:
        return requests.get(
            f"{IMDS_BASE}/latest/meta-data/{path}",
            headers={"X-aws-ec2-metadata-token": self._get_token()},
            timeout=2,
        )

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    def run(self) -> None:
        logger.info("Termination watcher started (poll interval %ds)", POLL_INTERVAL)
        while not self._shutdown_event.is_set():
            try:
                resp = self._get_metadata("spot/termination-time")
                if resp.status_code == 200:
                    termination_time = resp.text.strip()
                    logger.warning(
                        "Spot interruption notice received — termination at %s. "
                        "Setting shutdown flag.",
                        termination_time,
                    )
                    self._shutdown_event.set()
                    return
                # 404 means no notice yet — normal
            except requests.RequestException as exc:
                # IMDS unavailable (non-EC2 dev environment or transient blip) — skip
                logger.debug("IMDS poll failed: %s", exc)

            time.sleep(POLL_INTERVAL)

        logger.info("Termination watcher stopped.")
