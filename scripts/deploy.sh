#!/usr/bin/env bash
# Deploy all WatchTell stacks + build and sync frontend SPA.
# Usage: ./scripts/deploy.sh [--skip-frontend]
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
SKIP_FRONTEND=${1:-""}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# ---- Deploy CDK stacks ----
log "Deploying CDK stacks..."
cd "$ROOT/infrastructure"
cdk deploy --all --require-approval never

# ---- Package and upload worker ----
log "Packaging worker..."
cd "$ROOT/worker"
tar -czf /tmp/watchtell-worker.tar.gz .
aws s3 cp /tmp/watchtell-worker.tar.gz \
    s3://watchtell-deploy/worker/latest.tar.gz \
    --region "$REGION"
log "Worker artifact uploaded."

# ---- Build and deploy frontend ----
if [[ "$SKIP_FRONTEND" != "--skip-frontend" ]]; then
    log "Building frontend..."
    cd "$ROOT/frontend"
    npm run build

    # Fetch SPA bucket name from CDK outputs
    SPA_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name WatchtellCdn \
        --region "$REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='SpaBucketName'].OutputValue" \
        --output text)

    DIST_ID=$(aws cloudformation describe-stacks \
        --stack-name WatchtellCdn \
        --region "$REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" \
        --output text)

    log "Syncing to s3://$SPA_BUCKET..."
    # JS — must have correct MIME type for ES module loading
    aws s3 sync dist/ "s3://$SPA_BUCKET" \
        --delete \
        --cache-control "public,max-age=31536000,immutable" \
        --exclude "index.html" \
        --exclude "*.css" \
        --exclude "*.map" \
        --content-type "application/javascript"
    # CSS
    aws s3 sync dist/ "s3://$SPA_BUCKET" \
        --cache-control "public,max-age=31536000,immutable" \
        --exclude "*" \
        --include "*.css" \
        --content-type "text/css"

    # index.html must never be cached
    aws s3 cp dist/index.html "s3://$SPA_BUCKET/index.html" \
        --cache-control "no-cache,no-store,must-revalidate"

    # Invalidate CloudFront
    CF_ID=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?Comment=='watchtell-cdn'].Id" \
        --output text)
    if [[ -n "$CF_ID" ]]; then
        aws cloudfront create-invalidation --distribution-id "$CF_ID" --paths "/*"
        log "CloudFront invalidation created for $CF_ID"
    fi

    log "Frontend deployed. Domain: $DIST_ID"
fi

log "=== Deployment complete ==="
