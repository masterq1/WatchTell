#!/usr/bin/env python3
"""
Seed the DynamoDB watchlist table with test entries.
Usage: python scripts/seed-watchlist.py [--table watchtell-watchlist] [--region us-east-1]
"""
import argparse
import boto3

SEED_ENTRIES = [
    {"PlateNumber": "TEST001", "Note": "Test entry — remove before production"},
    {"PlateNumber": "STOLEN1", "Note": "Simulated stolen vehicle for testing"},
]


def main():
    parser = argparse.ArgumentParser(description="Seed WatchTell watchlist")
    parser.add_argument("--table", default="watchtell-watchlist")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--clear", action="store_true", help="Clear all entries first")
    args = parser.parse_args()

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    table = dynamodb.Table(args.table)

    if args.clear:
        print(f"Clearing table {args.table}...")
        resp = table.scan(ProjectionExpression="PlateNumber")
        with table.batch_writer() as batch:
            for item in resp.get("Items", []):
                batch.delete_item(Key={"PlateNumber": item["PlateNumber"]})
        print("Table cleared.")

    print(f"Seeding {len(SEED_ENTRIES)} entries into {args.table}...")
    with table.batch_writer() as batch:
        for entry in SEED_ENTRIES:
            batch.put_item(Item=entry)
            print(f"  + {entry['PlateNumber']} — {entry['Note']}")

    print("Done.")


if __name__ == "__main__":
    main()
