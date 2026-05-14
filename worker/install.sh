#!/usr/bin/env bash
# WatchTell Worker Install
# Designed for Amazon Linux 2023 x86_64.
# Called from EC2 user data: AWS_DEFAULT_REGION=us-east-1 bash install.sh
#
# FAST PATH: if launched from an AMI built with build-ami.sh, all build
# steps (3a-5) skip instantly — only steps 6-9 run (~30s total).
# SLOW PATH: first run from stock AL2023 takes ~45 min to build all deps.
#
# Safe to re-run — all steps are idempotent.
set -uo pipefail

WORKER_DIR="/opt/watchtell"
LOG="/var/log/watchtell-install.log"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
ENABLE_LOCAL_HLS="${ENABLE_LOCAL_HLS:-1}"
WATCHTELL_SKIP_S3_REFRESH="${WATCHTELL_SKIP_S3_REFRESH:-0}"
WATCHTELL_CREATE_AMI_IF_MISSING="${WATCHTELL_CREATE_AMI_IF_MISSING:-0}"

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

get_ssm_or_default() {
  local name="$1"
  local fallback="$2"
  aws ssm get-parameter \
    --name "$name" \
    --with-decryption \
    --query Parameter.Value \
    --output text \
    --region "$REGION" 2>/dev/null || echo "$fallback"
}

QUEUE_URL=$(get_ssm_or_default \
  /watchtell/runtime/alpr_queue_url \
  "https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/watchtell-alpr-queue")
RESULT_QUEUE_URL=$(get_ssm_or_default \
  /watchtell/runtime/results_queue_url \
  "https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/watchtell-alpr-results")
MEDIA_BUCKET=$(get_ssm_or_default \
  /watchtell/runtime/media_bucket \
  "watchtell-media-${ACCOUNT}")
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
  libjpeg-devel libpng-devel libtiff-devel zlib-devel \
  giflib-devel libwebp-devel libcurl-devel \
  || fail "some system packages unavailable"

# ---------------------------------------------------------------------------
# 3a. log4cplus 2.0.7 (build from source — not in AL2023 repos, required by OpenALPR)
# ---------------------------------------------------------------------------
if ! ldconfig -p | grep -q liblog4cplus; then
  log "Building log4cplus 2.0.7 from source..."
  cd /tmp
  rm -rf log4cplus-2.0.7
  curl -sL "https://github.com/log4cplus/log4cplus/releases/download/REL_2_0_7/log4cplus-2.0.7.tar.xz" \
    | tar -xJ
  cd log4cplus-2.0.7
  ./configure --prefix=/usr --disable-tests
  make -j"$(nproc)"
  make install
  ldconfig
  log "log4cplus installed."
else
  log "log4cplus already installed."
fi

# ---------------------------------------------------------------------------
# 3c. Leptonica 1.82.0 (build from source — not in AL2023 repos)
# ---------------------------------------------------------------------------
if ! ldconfig -p | grep -q liblept; then
  log "Building Leptonica 1.82.0 from source..."
  cd /tmp
  rm -rf leptonica-1.82.0
  curl -sL "https://github.com/DanBloomberg/leptonica/releases/download/1.82.0/leptonica-1.82.0.tar.gz" \
    | tar -xz
  cd leptonica-1.82.0
  ./configure --prefix=/usr
  make -j"$(nproc)"
  make install
  ldconfig
  log "Leptonica: $(pkg-config --modversion lept 2>/dev/null || echo installed)"
else
  log "Leptonica already installed."
fi

# ---------------------------------------------------------------------------
# 3d. Tesseract 4.1.3 (build from source — not in AL2023 repos)
# ---------------------------------------------------------------------------
if ! command -v tesseract &>/dev/null; then
  log "Building Tesseract 4.1.3 from source (5-10 min)..."
  cd /tmp
  rm -rf tesseract-4.1.3
  curl -sL "https://github.com/tesseract-ocr/tesseract/archive/refs/tags/4.1.3.tar.gz" \
    | tar -xz
  cd tesseract-4.1.3
  ./autogen.sh
  ./configure --prefix=/usr
  make -j"$(nproc)"
  make install
  ldconfig
  mkdir -p /usr/share/tessdata
  curl -sL "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata" \
    -o /usr/share/tessdata/eng.traineddata
  log "Tesseract: $(tesseract --version 2>&1 | head -1)"
else
  log "Tesseract already installed: $(tesseract --version 2>&1 | head -1)"
fi

# ---------------------------------------------------------------------------
# 3e. OpenCV 4.8.0 — includes ml module required by OpenALPR
#     videobuffer.cpp is stubbed in step 6 (worker doesn't use live capture)
# ---------------------------------------------------------------------------
if ! ldconfig -p | grep -q libopencv_core; then
  log "Building OpenCV 4.8.0 from source (15-20 min)..."
  cd /tmp
  rm -rf opencv-4.8.0
  curl -sL "https://github.com/opencv/opencv/archive/refs/tags/4.8.0.tar.gz" \
    | tar -xz
  mkdir -p opencv-4.8.0/build
  cd opencv-4.8.0/build
  cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=/usr \
    -DBUILD_LIST=core,imgproc,highgui,imgcodecs,objdetect,features2d,ml \
    -DBUILD_EXAMPLES=OFF \
    -DBUILD_TESTS=OFF \
    -DBUILD_PERF_TESTS=OFF \
    -DBUILD_opencv_python3=OFF \
    -DBUILD_opencv_python2=OFF \
    -DWITH_FFMPEG=OFF \
    -DWITH_GTK=OFF \
    -DWITH_QT=OFF \
    -DWITH_1394=OFF \
    -DWITH_GSTREAMER=OFF \
    -DWITH_IPP=OFF \
    -DWITH_TBB=OFF
  make -j"$(nproc)"
  make install
  ldconfig
  rm -rf /tmp/opencv-4.8.0
  # OpenCV 4.x installs headers to /usr/include/opencv4/opencv2/ — symlink the
  # legacy path so OpenALPR (which includes "opencv2/...") finds them.
  ln -sfn /usr/include/opencv4/opencv2 /usr/include/opencv2
  log "OpenCV: $(find /usr -name 'OpenCVConfig.cmake' 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo installed)"
else
  log "OpenCV already installed."
  # Ensure symlink exists on pre-built AMI fast path too
  ln -sfn /usr/include/opencv4/opencv2 /usr/include/opencv2 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 4. Python pip + packages
# ---------------------------------------------------------------------------
log "Setting up pip..."
# dnf is more reliable than bootstrap.pypa.io on AL2023
dnf install -y python3-pip -q || curl -sS https://bootstrap.pypa.io/get-pip.py | python3

log "Installing Python packages..."
python3 -m pip install --quiet \
  boto3 \
  Pillow \
  requests \
  opencv-python-headless \
  numpy \
  python-dotenv \
  || fail "some Python packages failed"

# ---------------------------------------------------------------------------
# 5. FFmpeg static binary
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
else
  log "FFmpeg already installed."
fi

# ---------------------------------------------------------------------------
# 6. OpenALPR (build from source — skip if already installed)
# ---------------------------------------------------------------------------
if ! command -v alpr &>/dev/null; then
  log "Building OpenALPR from source (10-15 min)..."
  cd /tmp
  rm -rf openalpr
  git clone --depth 1 https://github.com/openalpr/openalpr.git
  # Stub out videobuffer.cpp and videoio — OpenCV 4.x split videoio from highgui;
  # worker processes static JPEG frames so video capture is never needed.
  cat > /tmp/openalpr/src/video/videobuffer.cpp << 'VBEOF'
#include "videobuffer.h"
VideoBuffer::VideoBuffer() : dispatcher(nullptr) {}
VideoBuffer::~VideoBuffer() {}
void VideoBuffer::connect(std::string u, int f) { (void)u; (void)f; }
int VideoBuffer::getLatestFrame(cv::Mat* f, std::vector<cv::Rect>& r) { (void)f; (void)r; return -1; }
void VideoBuffer::disconnect() {}
VideoDispatcher* VideoBuffer::createDispatcher(std::string u, int f) { (void)u; (void)f; return nullptr; }
VBEOF
  # Stub videoio.hpp — OpenCV 4.x no longer includes VideoCapture via highgui.hpp
  cat > /usr/include/opencv4/opencv2/videoio.hpp << 'VIEOF'
#pragma once
#include "opencv2/core/core.hpp"
namespace cv {
  enum { CAP_PROP_POS_MSEC = 0 };
  class VideoCapture {
  public:
    VideoCapture(int n = 0) { (void)n; }
    VideoCapture(const std::string& s) { (void)s; }
    bool isOpened() const { return false; }
    bool read(cv::Mat& f) { (void)f; return false; }
    bool open(const std::string& s) { (void)s; return false; }
    bool set(int p, double v) { (void)p; (void)v; return false; }
  };
}
VIEOF
  # main.cpp needs explicit videoio include (OpenCV 4.x split from highgui)
  sed -i 's|#include "opencv2/imgproc/imgproc.hpp"|#include "opencv2/imgproc/imgproc.hpp"\n#include "opencv2/videoio.hpp"|' \
    /tmp/openalpr/src/main.cpp
  # Patch OpenCV 4.x compatibility: ml.hpp moved, CV_HAAR_DO_CANNY_PRUNING removed
  sed -i 's|opencv2/ml/ml.hpp|opencv2/ml.hpp|g' \
    /tmp/openalpr/src/openalpr/detection/detectorcpu.h \
    /tmp/openalpr/src/openalpr/detection/detectormorph.h \
    /tmp/openalpr/src/openalpr/detection/detectorocl.h \
    /tmp/openalpr/src/openalpr/detection/detectorcuda.h
  sed -i 's|CV_HAAR_DO_CANNY_PRUNING|2|g' \
    /tmp/openalpr/src/openalpr/detection/detectorocl.cpp
  # Stub motiondetector — uses cv::BackgroundSubtractor from video module (not built)
  cat > /tmp/openalpr/src/openalpr/motiondetector.h << 'HEOF'
#ifndef OPENALPR_MOTIONDETECTOR_H
#define OPENALPR_MOTIONDETECTOR_H

#include "opencv2/core/core.hpp"
#include "utility.h"

namespace alpr
{
  class MotionDetector
  {
    public:
      MotionDetector();
      virtual ~MotionDetector();
      void ResetMotionDetection(cv::Mat* frame);
      cv::Rect MotionDetect(cv::Mat* frame);
  };
}

#endif // OPENALPR_MOTIONDETECTOR_H
HEOF
  cat > /tmp/openalpr/src/openalpr/motiondetector.cpp << 'CEOF'
#include "motiondetector.h"

namespace alpr
{

MotionDetector::MotionDetector() {}
MotionDetector::~MotionDetector() {}

void MotionDetector::ResetMotionDetection(cv::Mat* frame)
{
  (void)frame;
}

cv::Rect MotionDetector::MotionDetect(cv::Mat* frame)
{
  (void)frame;
  return cv::Rect(0, 0, 0, 0);
}

}
CEOF
  mkdir -p /tmp/openalpr/src/build
  cd /tmp/openalpr/src/build
  OPENCV_CMAKE_DIR=$(find /usr -name "OpenCVConfig.cmake" 2>/dev/null | head -1 | xargs dirname)
  cmake \
    -DCMAKE_INSTALL_PREFIX=/usr \
    -DCMAKE_INSTALL_SYSCONFDIR=/etc \
    -DWITH_PYTHON3=ON \
    -DBUILD_TESTS=OFF \
    -DOpenCV_DIR="$OPENCV_CMAKE_DIR" \
    ..
  # Build only the targets we need — skip alpr/alprd CLI which fail on gcc11
  make -j2 openalpr openalprpy openalprgo
  # Install only the library targets
  make install/fast 2>/dev/null || true
  # Manually copy libs in case install/fast missed them
  find /tmp/openalpr/src/build -name "libopenalpr*.so.2" -size +1k \
    -exec cp {} /usr/lib/ \;
  ldconfig

  # Write standard openalpr.conf (empty after cmake install on AL2023)
  cat > /etc/openalpr/openalpr.conf << 'CONFEOF'
runtime_dir = /usr/share/openalpr/runtime_data
ocr_img_size_percent = 1.33333333
state_id_img_size_percent = 2.0
ocr_min_font_point = 6
detector = lbpcpu
detection_iteration_increase = 1.1
detection_strictness = 3
max_plate_width_percent = 100
max_plate_height_percent = 100
max_detection_input_width = 1280
max_detection_input_height = 960
contrast_detection_threshold = 0.3
must_match_pattern =
skip_detection = 0
detection_mask_image =
analysis_count = 2
prewarp =
max_plate_angle_degrees = 15
postprocess_min_confidence = 60
postprocess_confidence_skip_level = 80
debug_general = 0
debug_timing = 0
debug_prewarp = 0
debug_detector = 0
debug_state_id = 0
debug_plate_lines = 0
debug_plate_corners = 0
debug_char_segment = 0
debug_char_analysis = 0
debug_color_filter = 0
debug_ocr = 0
debug_postprocess = 0
debug_show_images = 0
debug_pause_on_frame = 0
CONFEOF

  # Copy fresh runtime_data from source (installed copy is often incomplete)
  cp -r /tmp/openalpr/runtime_data/* /usr/share/openalpr/runtime_data/

  # Write Python binding wrapper (correct function names for this build)
  mkdir -p /usr/local/lib/python3.9/site-packages/openalpr
  cat > /usr/local/lib/python3.9/site-packages/openalpr/openalpr.py << 'PYEOF'
import ctypes, json
lib = ctypes.cdll.LoadLibrary("/usr/lib/libopenalprpy.so.2")
lib.initialize.restype        = ctypes.c_void_p
lib.initialize.argtypes       = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p]
lib.dispose.restype           = None
lib.dispose.argtypes          = [ctypes.c_void_p]
lib.isLoaded.restype          = ctypes.c_bool
lib.isLoaded.argtypes         = [ctypes.c_void_p]
lib.recognizeFile.restype     = ctypes.c_void_p
lib.recognizeFile.argtypes    = [ctypes.c_void_p, ctypes.c_char_p]
lib.freeJsonMem.restype       = None
lib.freeJsonMem.argtypes      = [ctypes.c_void_p]
lib.setTopN.restype           = None
lib.setTopN.argtypes          = [ctypes.c_void_p, ctypes.c_int]
lib.setDefaultRegion.restype  = None
lib.setDefaultRegion.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
class Alpr:
    def __init__(self, country, config_file, runtime_dir):
        self._alpr = lib.initialize(country.encode(), config_file.encode(), runtime_dir.encode())
    def is_loaded(self):
        return lib.isLoaded(self._alpr)
    def set_top_n(self, n):
        lib.setTopN(self._alpr, n)
    def set_default_region(self, region):
        lib.setDefaultRegion(self._alpr, region.encode())
    def recognize_file(self, file_path):
        ptr = lib.recognizeFile(self._alpr, file_path.encode())
        data = json.loads(ctypes.string_at(ptr).decode())
        lib.freeJsonMem(ctypes.c_void_p(ptr))
        return data
    def unload(self):
        lib.dispose(self._alpr)
PYEOF
  cat > /usr/local/lib/python3.9/site-packages/openalpr/__init__.py << 'PYEOF'
from .openalpr import Alpr
PYEOF

  rm -rf /tmp/openalpr /tmp/log4cplus-* /tmp/leptonica-* /tmp/tesseract-* /tmp/opencv-*
  python3 -c "from openalpr import Alpr; a = Alpr('us', '/etc/openalpr/openalpr.conf', '/usr/share/openalpr/runtime_data'); assert a.is_loaded(), 'OpenALPR failed to load'"
  log "OpenALPR Python binding loaded successfully"
else
  log "OpenALPR already installed: $(alpr --version 2>&1 | head -1)"
fi

# Ensure openalpr Python binding is visible to Python 3
# CMake may install it under python2.7/dist-packages when Python 2 headers are found first
OPENALPR_PY=$(find /usr/lib/python2.7 /usr/local/lib -maxdepth 5 -name "openalpr" -type d 2>/dev/null | head -1)
if [ -n "$OPENALPR_PY" ]; then
  PY3_SITE=$(python3 -c "import site; print(site.getsitepackages()[0])")
  ln -sfn "$OPENALPR_PY" "$PY3_SITE/openalpr"
  log "Linked openalpr Python binding: $OPENALPR_PY -> $PY3_SITE/openalpr"
else
  log "openalpr Python binding already on Python 3 path or not found under python2.7."
fi

# ---------------------------------------------------------------------------
# 6b. Optional reusable AMI creation
# ---------------------------------------------------------------------------
# Single-stack deployments can boot from stock AL2023 the first time, build all
# heavy dependencies, then create a clean reusable AMI before runtime env files
# and camera secrets are written. Future CDK synths prefer the newest AMI tagged
# WatchTellWorker=true.
if [ "$WATCHTELL_CREATE_AMI_IF_MISSING" = "1" ]; then
  EXISTING_AMI=$(aws ec2 describe-images \
    --owners self \
    --filters "Name=tag:WatchTellWorker,Values=true" "Name=state,Values=available" \
    --query 'sort_by(Images,&CreationDate)[-1].ImageId' \
    --output text \
    --region "$REGION" 2>/dev/null || echo "")

  if [ -z "$EXISTING_AMI" ] || [ "$EXISTING_AMI" = "None" ]; then
    TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
      -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
    INSTANCE_ID=$(curl -sf -H "X-aws-ec2-metadata-token: $TOKEN" \
      "http://169.254.169.254/latest/meta-data/instance-id" 2>/dev/null || true)

    if [ -n "$INSTANCE_ID" ]; then
      AMI_NAME="watchtell-worker-$(date -u +%Y%m%d-%H%M%S)"
      log "Creating reusable worker AMI: $AMI_NAME"
      AMI_ID=$(aws ec2 create-image \
        --instance-id "$INSTANCE_ID" \
        --name "$AMI_NAME" \
        --description "WatchTell worker dependencies prebuilt on AL2023" \
        --no-reboot \
        --region "$REGION" \
        --query 'ImageId' \
        --output text)
      aws ec2 create-tags \
        --resources "$AMI_ID" \
        --tags Key=WatchTellWorker,Value=true Key=Name,Value="$AMI_NAME" \
        --region "$REGION"
      aws ssm put-parameter \
        --name /watchtell/ami/latest \
        --value "$AMI_ID" \
        --type String \
        --overwrite \
        --region "$REGION"
      log "AMI creation started: $AMI_ID"
    else
      log "Could not determine instance ID; skipping AMI creation."
    fi
  else
    log "Reusable worker AMI already exists: $EXISTING_AMI"
  fi
fi

# ---------------------------------------------------------------------------
# 7. Worker code (pull latest from S3)
# ---------------------------------------------------------------------------
if [ "$WATCHTELL_SKIP_S3_REFRESH" = "1" ]; then
  log "Using worker code already present in $WORKER_DIR."
else
  log "Deploying worker from s3://$DEPLOY_BUCKET/worker/latest.tar.gz..."
  mkdir -p "$WORKER_DIR"
  aws s3 cp "s3://$DEPLOY_BUCKET/worker/latest.tar.gz" /tmp/watchtell-worker.tar.gz \
    --region "$REGION"
  tar -xzf /tmp/watchtell-worker.tar.gz -C "$WORKER_DIR" --strip-components=1
  rm -f /tmp/watchtell-worker.tar.gz
  log "Worker code deployed."
fi

# ---------------------------------------------------------------------------
# 8. ALPR worker service
# ---------------------------------------------------------------------------
log "Configuring ALPR worker service..."
mkdir -p /etc/watchtell
cat > /etc/watchtell/worker.env <<EOF
AWS_DEFAULT_REGION=${REGION}
ALPR_QUEUE_URL=${QUEUE_URL}
RESULT_QUEUE_URL=${RESULT_QUEUE_URL}
MEDIA_BUCKET=${MEDIA_BUCKET}
ALPR_COUNTRY=us
ALPR_TOP_N=5
MOTION_THRESHOLD=10000
MIN_INTERVAL_SEC=1
CAPTURE_FPS=3
EOF
chmod 600 /etc/watchtell/worker.env

cp "$WORKER_DIR/watchtell-alpr.service" /etc/systemd/system/

# ---------------------------------------------------------------------------
# 9. Camera relay + HLS (configure from SSM if RTSP URL is present)
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
  HLS_URL=$(aws ssm get-parameter \
    --name /watchtell/camera/hls \
    --query Parameter.Value \
    --output text \
    --region "$REGION" 2>/dev/null || echo "")
  cat > "$WORKER_DIR/relay.env" <<EOF
CAMERA_ID=${CAMERA_ID}
RTSP_URL=${RTSP_URL}
MEDIA_BUCKET=${MEDIA_BUCKET}
HLS_BUCKET=${HLS_BUCKET}
HLS_URL=${HLS_URL}
QUEUE_URL=${QUEUE_URL}
AWS_REGION=${REGION}
MOTION_THRESHOLD=10000
MIN_INTERVAL_SEC=1
CAPTURE_FPS=3
EOF
  chmod 600 "$WORKER_DIR/relay.env"
  cp "$WORKER_DIR/watchtell-relay.service" /etc/systemd/system/
  if [ "$ENABLE_LOCAL_HLS" = "1" ]; then
    cp "$WORKER_DIR/watchtell-hls.service" /etc/systemd/system/
  fi
  log "Relay configured."
else
  log "No RTSP URL in SSM — skipping relay setup."
fi

# ---------------------------------------------------------------------------
# 10. Enable and start services
# ---------------------------------------------------------------------------
log "Starting services..."
systemctl daemon-reload

systemctl enable --now watchtell-alpr \
  && log "ALPR worker started." || fail "ALPR worker failed to start"

if [ -f /etc/systemd/system/watchtell-relay.service ]; then
  systemctl enable --now watchtell-relay \
    && log "Camera relay started." || fail "Camera relay failed to start"
  if [ -f /etc/systemd/system/watchtell-hls.service ]; then
    systemctl enable --now watchtell-hls \
      && log "HLS relay started." || fail "HLS relay failed to start"
  else
    log "Local HLS relay disabled; use /watchtell/camera/hls for browser playback."
  fi
fi

log "=== WatchTell Install COMPLETE ==="
