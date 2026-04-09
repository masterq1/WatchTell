#!/usr/bin/env bash
# Manually trigger worker re-installation on a running EC2 instance via SSM.
# Usage: ./scripts/worker-setup.sh <instance-id>
set -euo pipefail

INSTANCE_ID="${1:?Usage: $0 <instance-id>}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "Sending worker install command to $INSTANCE_ID..."

CMD_ID=$(aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --region "$REGION" \
    --parameters 'commands=["bash /opt/watchtell/install.sh"]' \
    --query "Command.CommandId" \
    --output text)

echo "Command ID: $CMD_ID"
echo "Waiting for completion..."

aws ssm wait command-executed \
    --command-id "$CMD_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION"

aws ssm get-command-invocation \
    --command-id "$CMD_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query "{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}" \
    --output json
