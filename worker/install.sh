#!/usr/bin/env bash
# WatchTell Worker Install
# Designed for Amazon Linux 2023 x86_64.
# Called from EC2 user data: AWS_DEFAULT_REGION=us-east-1 bash install.sh
# Safe to re-run — all steps are idempotent.
set -uo pipefail

WORKER_DIR="/opt/watchtell"
LOG="/var/log/watchtell-install.log"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

log()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }
fail() { log "ERROR: $*"; }

exec >> "$LOG" 2>&1
log "=== WatchTell Install START ==="

# ---------------------------------------------------------------------------
# 1. Resolve AWS account ID from EC2 instance metadata (IMDSv2)
# ---------------------------------------------------------------------------
TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
if [ -n "$TOKEN" ]; then
  ACCOUNT=$(curl -sf -H "X-aws-ec2-metadata-token: $TOKEN" \
    "http://169.254.169.254/latest/dynamic/instance-identity/document" \
    | grep '"accountId"' | cut -d'"' -f4)
fi
ACCOUNT="${ACCOUNT:-${AWS_ACCOUNT_ID:-}}"
[ -n "$ACCOUNT" ] || { log "FATAL: cannot determine account ID"; exit 1; }
log "Account: $ACCOUNT  Region: $REGION"

QUEUE_URL="https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/watchtell-alpr-queue"
MEDIA_BUCKET="watchtell-media-${ACCOUNT}"
HLS_BUCKET="watchtell-hls-${ACCOUNT}"
DEPLOY_BUCKET="watchtell-deploy"

# ---------------------------------------------------------------------------
# 2. System packages
# ---------------------------------------------------------------------------
log "Installing system packages..."
dnf install -y \
  cmake make gcc gcc-c++ git \
  autoconf automake libtool pkg-config \
  python3 \
  mesa-libGL libSM libXext libXrender \
  || fail "some system packages unavailable"

# Tesseract + Leptonica (required by OpenALPR)
log "Installing tesseract..."
dnf install -y tesseract tesseract-devel leptonica leptonica-devel \
  && log "tesseract installed via dnf" \
  || log "WARN: tesseract not in dnf repos — OpenALPR build may fail"

# ---------------------------------------------------------------------------
# 3. Python pip + packages
# ---------------------------------------------------------------------------
log "Setting up pip..."
python3 -m pip --version &>/dev/null || \
  curl -sS https://bootstrap.pypa.io/get-pip.py | python3

log "Installing Python packages..."
python3 -m pip install --quiet \
  boto3 \
  opencv-python-headless \
  numpy \
  python-dotenv \
  || fail "some Python packages failed"

# ---------------------------------------------------------------------------
# 4. FFmpeg static binary
# ---------------------------------------------------------------------------
if ! command -v ffmpeg &>/dev/null; then
  log "Installing FFmpeg static binary..."
  tmpdir=$(mktemp -d)
  curl -sL "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz" \
    | tar -xJ -C "$tmpdir"
  find "$tmpdir" -name "ffmpeg" -type f | head -1 | xargs -I{} cp {} /usr/local/bin/ffmpeg
  chmod +x /usr/local/bin/ffmpeg
  rm -rf "$tmpdir"
  log "FFmpeg: $(ffmpeg -version 2>&1 | head -1)"
fi

# ---------------------------------------------------------------------------
# 5. OpenALPR (build from source — skip if already installed)
# ---------------------------------------------------------------------------
if ! command -v alpr &>/dev/null; then
  log "Building OpenALPR from source (10-15 min)..."
  cd /tmp
  rm -rf openalpr
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
  rm -rf /tmp/openalpr
  command -v alpr \
    && log "OpenALPR: $(alpr --version 2>&1 | head -1)" \
    || fail "OpenALPR build finished but binary not found"
else
  log "OpenALPR already installed: $(alpr --version 2>&1 | head -1)"
fi

# ---------------------------------------------------------------------------
# 6. Worker code (pull latest from S3)
# ---------------------------------------------------------------------------
log "Deploying worker from s3://$DEPLOY_BUCKET/worker/latest.tar.gz..."
mkdir -p "$WORKER_DIR"
aws s3 cp "s3://$DEPLOY_BUCKET/worker/latest.tar.gz" /tmp/watchtell-worker.tar.gz \
  --region "$REGION"
tar -xzf /tmp/watchtell-worker.tar.gz -C "$WORKER_DIR" --strip-components=1
rm -f /tmp/watchtell-worker.tar.gz
log "Worker code deployed."

# ---------------------------------------------------------------------------
# 7. ALPR worker service
# ---------------------------------------------------------------------------
log "Configuring ALPR worker service..."
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

cp "$WORKER_DIR/watchtell-alpr.service" /etc/systemd/system/

# ---------------------------------------------------------------------------
# 8. Camera relay + HLS (configure from SSM if RTSP URL is present)
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
  log "Configuring relay: camera=$CAMERA_ID"
  cat > "$WORKER_DIR/relay.env" <<EOF
CAMERA_ID=${CAMERA_ID}
RTSP_URL=${RTSP_URL}
MEDIA_BUCKET=${MEDIA_BUCKET}
HLS_BUCKET=${HLS_BUCKET}
QUEUE_URL=${QUEUE_URL}
AWS_REGION=${REGION}
MOTION_THRESHOLD=2000
MIN_INTERVAL_SEC=3
EOF
  chmod 600 "$WORKER_DIR/relay.env"
  cp "$WORKER_DIR/watchtell-relay.service" /etc/systemd/system/
  cp "$WORKER_DIR/watchtell-hls.service"   /etc/systemd/system/
  log "Relay configured."
else
  log "No RTSP URL in SSM — skipping relay setup."
fi

# ---------------------------------------------------------------------------
# 9. Enable and start services
# ---------------------------------------------------------------------------
log "Starting services..."
systemctl daemon-reload

systemctl enable --now watchtell-alpr \
  && log "ALPR worker started." || fail "ALPR worker failed to start"

if [ -f /etc/systemd/system/watchtell-relay.service ]; then
  systemctl enable --now watchtell-relay \
    && log "Camera relay started." || fail "Camera relay failed to start"
  systemctl enable --now watchtell-hls \
    && log "HLS relay started." || fail "HLS relay failed to start"
fi

log "=== WatchTell Install COMPLETE ==="
