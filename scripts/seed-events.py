#!/usr/bin/env python3
"""
Seed the DynamoDB events table with test entries for UI verification.
Usage: python scripts/seed-events.py [--table watchtell-events] [--region us-east-1]
"""
import argparse
import uuid
from datetime import datetime, timedelta, timezone

import boto3


SEED_EVENTS = [
    {
        "PlateNumber": "ABC1234",
        "EventType": "entry",
        "ValidationStatus": "valid",
        "Confidence": 94,
        "CameraId": "doorway",
        "S3Key": "clips/test/abc1234-entry.mp4",
        "offset_minutes": 2,
    },
    {
        "PlateNumber": "STOLEN1",
        "EventType": "entry",
        "ValidationStatus": "stolen",
        "Confidence": 91,
        "CameraId": "doorway",
        "S3Key": "clips/test/stolen1-entry.mp4",
        "offset_minutes": 18,
    },
    {
        "PlateNumber": "XYZ9988",
        "EventType": "exit",
        "ValidationStatus": "unknown",
        "Confidence": 87,
        "CameraId": "doorway",
        "S3Key": "clips/test/xyz9988-exit.mp4",
        "offset_minutes": 45,
    },
]


def main():
    parser = argparse.ArgumentParser(description="Seed WatchTell events table")
    parser.add_argument("--table", default="watchtell-events")
    parser.add_argument("--region", default="us-east-1")
    args = parser.parse_args()

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    table = dynamodb.Table(args.table)
    now = datetime.now(timezone.utc)

    print("Seeding {} events into {}...".format(len(SEED_EVENTS), args.table))
    with table.batch_writer() as batch:
        for seed in SEED_EVENTS:
            ts = (now - timedelta(minutes=seed["offset_minutes"])).strftime("%Y-%m-%dT%H:%M:%SZ")
            item = {
                "EventId": str(uuid.uuid4()),
                "Timestamp": ts,
                "CameraId": seed["CameraId"],
                "PlateNumber": seed["PlateNumber"],
                "Confidence": seed["Confidence"],
                "EventType": seed["EventType"],
                "ValidationStatus": seed["ValidationStatus"],
                "S3Key": seed["S3Key"],
                "StoredAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            batch.put_item(Item=item)
            print("  + {} | {} | {} | {}".format(
                item["PlateNumber"], item["EventType"], item["ValidationStatus"], item["Timestamp"]
            ))

    print("Done.")


if __name__ == "__main__":
    main()
