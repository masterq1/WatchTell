#!/usr/bin/env bash
# build-ami.sh — Create a WatchTell worker AMI with all dependencies pre-installed.
#
# Usage:
#   AWS_DEFAULT_REGION=us-east-1 bash build-ami.sh
#
# This script:
#   1. Finds the current running worker instance
#   2. Runs install.sh on it to ensure all deps are built (idempotent)
#   3. Creates an AMI from the instance
#   4. Prints the new AMI ID for use in the CDK launch template
#
# Run this whenever you change system dependencies (OpenCV, Tesseract, etc.).
# Worker code updates do NOT require a new AMI — they're pulled from S3 at boot.
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
ASG_NAME="watchtell-alpr-asg"
AMI_NAME="watchtell-worker-$(date -u +%Y%m%d-%H%M)"

log() { echo "[$(date -u +%H:%M:%SZ)] $*"; }

# Find the running instance from the ASG
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --region "$REGION" \
  --query 'AutoScalingGroups[0].Instances[?LifecycleState==`InService`].InstanceId' \
  --output text | awk '{print $1}')

[ -n "$INSTANCE_ID" ] || { echo "ERROR: No InService instance found in $ASG_NAME"; exit 1; }
log "Instance: $INSTANCE_ID"

# Ensure install.sh has completed (all build steps present)
log "Verifying dependencies on instance..."
CMD_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["command -v alpr && alpr --version || { echo ALPR-MISSING; exit 1; }; command -v tesseract && tesseract --version 2>&1 | head -1; pkg-config --modversion opencv4; echo ALL-OK"]' \
  --region "$REGION" \
  --query 'Command.CommandId' \
  --output text)

sleep 10
RESULT=$(aws ssm get-command-invocation \
  --command-id "$CMD_ID" \
  --instance-id "$INSTANCE_ID" \
  --region "$REGION" \
  --query 'StandardOutputContent' \
  --output text)

echo "$RESULT"
echo "$RESULT" | grep -q "ALL-OK" || { echo "ERROR: Not all deps installed. Run install.sh first."; exit 1; }

# Stop services so AMI has a clean state
log "Stopping services before snapshot..."
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["systemctl stop watchtell-alpr watchtell-relay watchtell-hls 2>/dev/null || true; rm -f /etc/watchtell/worker.env /opt/watchtell/relay.env 2>/dev/null || true; echo done"]' \
  --region "$REGION" \
  --query 'Command.CommandId' \
  --output text > /dev/null

sleep 15

# Create the AMI
log "Creating AMI: $AMI_NAME..."
AMI_ID=$(aws ec2 create-image \
  --instance-id "$INSTANCE_ID" \
  --name "$AMI_NAME" \
  --description "WatchTell worker — Leptonica/Tesseract/OpenCV/OpenALPR pre-built on AL2023" \
  --no-reboot \
  --region "$REGION" \
  --query 'ImageId' \
  --output text)

log "AMI creation started: $AMI_ID"
log "Waiting for AMI to become available (5-10 min)..."

aws ec2 wait image-available \
  --image-ids "$AMI_ID" \
  --region "$REGION"

log "AMI ready: $AMI_ID"

# Restart services on the current instance
log "Restarting services on current instance..."
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=[\"AWS_DEFAULT_REGION=$REGION bash /opt/watchtell/install.sh\"]" \
  --region "$REGION" \
  --query 'Command.CommandId' \
  --output text > /dev/null

echo ""
echo "=========================================="
echo "  New AMI: $AMI_ID"
echo "  Name:    $AMI_NAME"
echo ""
echo "  Next: update the CDK launch template:"
echo "    AMI_ID=$AMI_ID"
echo "    cd infrastructure && cdk deploy WatchtellCompute"
echo "=========================================="
