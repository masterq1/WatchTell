#!/usr/bin/env bash
# WatchTell Worker Install — runs on Amazon Linux 2023 x86_64 via EC2 user data.
# Installs: OpenALPR (from source), ALPR worker service, camera relay service.
set -euo pipefail

WORKER_DIR="/opt/watchtell"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
ACCOUNT="${AWS_ACCOUNT_ID:-}"
DEPLOY_BUCKET="watchtell-deploy"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
log "=== WatchTell Install START ==="

# ---------------------------------------------------------------------------
# 1. System packages
# ---------------------------------------------------------------------------
log "Installing system packages..."
dnf update -y
dnf install -y python3.12 python3.12-pip git cmake make gcc gcc-c++ \
    openssl-devel blas-devel opencv opencv-devel \
    libtesseract-devel leptonica-devel \
    mesa-libGL libSM libXext libXrender

# ---------------------------------------------------------------------------
# 2. OpenALPR from source (skip if already installed)
# ---------------------------------------------------------------------------
if ! command -v alpr &>/dev/null; then
    log "Building OpenALPR from source (this takes ~5 min)..."
    cd /tmp
    git clone --depth 1 https://github.com/openalpr/openalpr.git
    mkdir -p /tmp/openalpr/src/build
    cd /tmp/openalpr/src/build
    cmake \
        -DCMAKE_INSTALL_PREFIX=/usr \
        -DCMAKE_INSTALL_SYSCONFDIR=/etc \
        -DWITH_PYTHON3=ON \
        ..
    make -j"$(nproc)"
    make install
    ldconfig
    log "OpenALPR installed: $(alpr --version 2>&1 | head -1)"
fi

# ---------------------------------------------------------------------------
# 3. Worker code
# ---------------------------------------------------------------------------
log "Deploying worker from s3://$DEPLOY_BUCKET/worker/latest.tar.gz..."
mkdir -p "$WORKER_DIR"
aws s3 cp "s3://$DEPLOY_BUCKET/worker/latest.tar.gz" /tmp/watchtell-worker.tar.gz \
    --region "$REGION"
tar -xzf /tmp/watchtell-worker.tar.gz -C "$WORKER_DIR" --strip-components=1
rm /tmp/watchtell-worker.tar.gz

# ---------------------------------------------------------------------------
# 4. Python dependencies (openalpr is installed by cmake above, not pip)
# ---------------------------------------------------------------------------
log "Installing Python dependencies..."
pip3.12 install -r "$WORKER_DIR/requirements.txt"

# ---------------------------------------------------------------------------
# 5. ALPR worker service
# ---------------------------------------------------------------------------
log "Configuring ALPR worker service..."
QUEUE_URL="https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/watchtell-alpr-queue"
MEDIA_BUCKET="watchtell-media-${ACCOUNT}"

mkdir -p /etc/watchtell
cat > /etc/watchtell/worker.env <<EOF
AWS_DEFAULT_REGION=${REGION}
ALPR_QUEUE_URL=${QUEUE_URL}
RESULT_QUEUE_URL=${QUEUE_URL}
MEDIA_BUCKET=${MEDIA_BUCKET}
ALPR_COUNTRY=us
ALPR_TOP_N=5
EOF
chmod 600 /etc/watchtell/worker.env

# Patch the service file to use the env file
sed -i 's|^WorkingDirectory=.*|WorkingDirectory=/opt/watchtell\nEnvironmentFile=/etc/watchtell/worker.env|' \
    "$WORKER_DIR/watchtell-alpr.service"

cp "$WORKER_DIR/watchtell-alpr.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable watchtell-alpr
systemctl start watchtell-alpr
log "ALPR worker started."

# ---------------------------------------------------------------------------
# 6. FFmpeg static binary (needed for HLS relay)
# ---------------------------------------------------------------------------
if ! command -v ffmpeg &>/dev/null; then
    log "Installing FFmpeg static binary..."
    tmpdir=$(mktemp -d)
    curl -sL "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz" \
        | tar -xJ -C "$tmpdir"
    find "$tmpdir" -name "ffmpeg" -type f | head -1 | xargs -I{} mv {} /usr/local/bin/ffmpeg
    chmod +x /usr/local/bin/ffmpeg
    rm -rf "$tmpdir"
    log "FFmpeg: $(ffmpeg -version 2>&1 | head -1)"
fi

# ---------------------------------------------------------------------------
# 7. Camera relay + HLS services (only if /watchtell/relay/rtsp_url is set in SSM)
# ---------------------------------------------------------------------------
log "Checking SSM for relay config..."
RTSP_URL=$(aws ssm get-parameter \
    --name /watchtell/relay/rtsp_url \
    --with-decryption \
    --query Parameter.Value \
    --output text \
    --region "$REGION" 2>/dev/null || echo "")

CAMERA_ID=$(aws ssm get-parameter \
    --name /watchtell/relay/camera_id \
    --query Parameter.Value \
    --output text \
    --region "$REGION" 2>/dev/null || echo "cam-01")

if [ -n "$RTSP_URL" ] && [ "$RTSP_URL" != "rtsp://PLACEHOLDER" ]; then
    log "Relay RTSP URL found — configuring relay for camera: $CAMERA_ID"
    cat > "$WORKER_DIR/relay.env" <<EOF
CAMERA_ID=${CAMERA_ID}
RTSP_URL=${RTSP_URL}
MEDIA_BUCKET=${MEDIA_BUCKET}
HLS_BUCKET=watchtell-hls-${ACCOUNT}
QUEUE_URL=${QUEUE_URL}
AWS_REGION=${REGION}
MOTION_THRESHOLD=2000
MIN_INTERVAL_SEC=3
EOF
    chmod 600 "$WORKER_DIR/relay.env"
    cp "$WORKER_DIR/watchtell-relay.service" /etc/systemd/system/
    cp "$WORKER_DIR/watchtell-hls.service"   /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable watchtell-relay watchtell-hls
    systemctl start watchtell-relay watchtell-hls
    log "Camera relay started (camera=$CAMERA_ID)."
    log "HLS relay started — segments uploading to s3://${MEDIA_BUCKET}/hls/${CAMERA_ID}/"
else
    log "No RTSP URL configured — skipping relay and HLS setup."
fi

log "=== WatchTell Install COMPLETE ==="
systemctl status watchtell-alpr --no-pager || true
