#!/usr/bin/env bash
# Bootstrap: one-time CDK bootstrap for account + install all deps.
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "=== WatchTell Bootstrap ==="
echo "Account: $ACCOUNT_ID | Region: $REGION"

# Bootstrap CDK
echo "--- CDK bootstrap ---"
cd "$(dirname "$0")/../infrastructure"
pip install -r requirements.txt
cdk bootstrap "aws://$ACCOUNT_ID/$REGION"

# Install frontend deps
echo "--- Frontend deps ---"
cd ../frontend
npm install

# Install mobile deps
echo "--- Mobile deps ---"
cd ../mobile
npm install

echo "=== Bootstrap complete ==="
echo "Next: run scripts/deploy.sh to deploy all stacks."
