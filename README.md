<div align="center">

<img src="https://img.shields.io/badge/WatchTell-License%20Plate%20Surveillance-0f172a?style=for-the-badge&logo=amazonaws&logoColor=white" alt="WatchTell" />

<br/>
<br/>

[![AWS CDK](https://img.shields.io/badge/AWS%20CDK-Python-FF9900?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com/cdk/)
[![OpenALPR](https://img.shields.io/badge/OpenALPR-ALPR%20Engine-1a73e8?style=flat-square&logo=opencv&logoColor=white)](https://github.com/openalpr/openalpr)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![DynamoDB](https://img.shields.io/badge/DynamoDB-NoSQL-4053D6?style=flat-square&logo=amazondynamodb&logoColor=white)](https://aws.amazon.com/dynamodb/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)

<br/>

**WatchTell** is a self-hosted, cloud-native license plate surveillance system built on AWS.  
It captures motion-triggered keyframes from RTSP IP cameras, recognises plate numbers using OpenALPR,  
stores events in DynamoDB, and alerts operators in real time when a flagged vehicle appears.

<br/>

[**Live Dashboard →**](https://dd11snhf0jiad.cloudfront.net)  &nbsp;|&nbsp;  [Architecture](#architecture)  &nbsp;|&nbsp;  [Quick Start](#quick-start)  &nbsp;|&nbsp;  [Configuration](#configuration)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Configuration Reference](#configuration-reference)
- [Pipeline Deep-Dive](#pipeline-deep-dive)
- [Operator Dashboard](#operator-dashboard)
- [Camera Relay](#camera-relay)
- [Deployment](#deployment)
- [Plate Validation](#plate-validation)
- [Motion Sensitivity Tuning](#motion-sensitivity-tuning)

---

## Overview

WatchTell turns any network-connected IP camera into an automated vehicle-access log with license plate recognition. Frames are captured on-device whenever motion is detected, uploaded to S3, and processed on a cost-effective EC2 Spot instance running OpenALPR. Results flow through an AWS Step Functions pipeline that validates, stores, and checks plates against a user-managed watchlist — triggering SNS email alerts on hits.

The web dashboard streams live HLS video and displays the searchable event history with keyframe thumbnails, plate tags, timestamps, and alert badges.

---

## Features

| Feature | Description |
|---|---|
| 🎥 **RTSP Ingest** | Connects to any IP camera via RTSP, evaluates frames at configurable FPS |
| 🏃 **Motion Detection** | OpenCV pixel-diff filter avoids uploading empty frames |
| 🔤 **ALPR** | OpenALPR on EC2 Spot — highest-confidence candidate selected per frame |
| 🔁 **Step Functions Pipeline** | Parse → Validate → Store → Check Watchlist, fully serverless |
| 🗄️ **DynamoDB Events** | Searchable by plate, camera, and date range via GSI indexes |
| 🔔 **Watchlist Alerts** | SNS email notification when a stolen, suspended, or flagged plate is seen |
| 🖥️ **Web Dashboard** | React SPA with live HLS feed, event feed, search, alerts, and settings |
| 📱 **Mobile App** | React Native / Expo companion app for iOS and Android |
| 🔒 **Cognito Auth** | JWT-secured API Gateway; all dashboard routes protected |
| 🖼️ **Keyframe Thumbnails** | Pre-signed S3 URLs surfaced in every event card |
| 🌐 **CloudFront CDN** | SPA and media served globally via CloudFront + OAC |
| 💸 **Spot Cost Optimisation** | EC2 Spot worker with exponential-backoff reconnect; max $0.08/hr |

---

## Architecture

### End-to-End Flow

```mermaid
flowchart TD
    CAM["📷 IP Camera\n(RTSP)"]
    RELAY["🖥️ Camera Relay\ncamera_relay.py"]
    S3M["🪣 S3\nMedia Bucket\nkeyframes/"]
    SQS1["📨 SQS\nALPR Queue"]
    EC2["⚙️ EC2 Spot\nOpenALPR Worker"]
    SQS2["📨 SQS\nResults Queue"]
    TRIG["λ SQS Trigger\nLambda"]
    SF["🔄 Step Functions\nPipeline"]
    PARSE["λ ParseResult"]
    VALID["λ ValidatePlate\n(SearchQuarry + Redis)"]
    STORE["λ StoreEvent"]
    CHECK["λ CheckWatchlist"]
    DDB["🗄️ DynamoDB\nEvents Table"]
    WL["🗄️ DynamoDB\nWatchlist Table"]
    SNS["🔔 SNS\nAlert Email"]
    APIGW["🌐 API Gateway\n(Cognito JWT)"]
    CF["☁️ CloudFront"]
    SPA["⚛️ React SPA\nDashboard"]
    MOB["📱 React Native\nMobile App"]

    CAM -->|RTSP stream| RELAY
    RELAY -->|JPEG keyframe| S3M
    RELAY -->|job message| SQS1
    SQS1 --> EC2
    EC2 -->|plate + confidence| SQS2
    SQS2 --> TRIG
    TRIG --> SF
    SF --> PARSE --> VALID --> STORE --> CHECK
    STORE --> DDB
    CHECK --> WL
    CHECK -->|hit!| SNS
    DDB --> APIGW
    S3M -->|presigned URL| APIGW
    APIGW --> CF
    CF --> SPA
    CF --> MOB
```

### AWS Infrastructure Overview

```mermaid
graph LR
    subgraph Edge
        CF["CloudFront\nDistribution"]
        SPA_BUCKET["S3 SPA\nBucket"]
    end

    subgraph API["API Layer"]
        APIGW["API Gateway\nHTTP API"]
        COGNITO["Cognito\nUser Pool"]
        LAMBDAS["Lambda\nHandlers ×5"]
    end

    subgraph Pipeline["Processing Pipeline"]
        SQS_ALPR["SQS ALPR\nQueue"]
        SQS_RES["SQS Results\nQueue"]
        SF_EXEC["Step\nFunctions"]
        PIPE_LAMBDAS["Pipeline\nLambdas ×5"]
    end

    subgraph Compute["EC2 Spot Worker"]
        ASG["Auto Scaling\nGroup"]
        WORKER["alpr_worker.py\n+ OpenALPR"]
    end

    subgraph Storage["Storage"]
        MEDIA["S3 Media\nBucket"]
        EVENTS_TBL["DynamoDB\nEvents"]
        WL_TBL["DynamoDB\nWatchlist"]
        REDIS["Upstash\nRedis Cache"]
        SSM["SSM\nParameter Store"]
    end

    CF --> SPA_BUCKET
    CF --> APIGW
    COGNITO --> APIGW
    APIGW --> LAMBDAS
    LAMBDAS --> EVENTS_TBL
    LAMBDAS --> WL_TBL
    LAMBDAS --> MEDIA
    SQS_ALPR --> ASG
    WORKER --> SQS_RES
    SQS_RES --> SF_EXEC
    SF_EXEC --> PIPE_LAMBDAS
    PIPE_LAMBDAS --> EVENTS_TBL
    PIPE_LAMBDAS --> WL_TBL
    PIPE_LAMBDAS --> REDIS
    SSM --> WORKER
    SSM --> LAMBDAS
```

---

## Tech Stack

### Backend & Infrastructure

![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![AWS Lambda](https://img.shields.io/badge/AWS%20Lambda-FF9900?style=for-the-badge&logo=awslambda&logoColor=white)
![AWS CDK](https://img.shields.io/badge/AWS%20CDK-232F3E?style=for-the-badge&logo=amazonaws&logoColor=white)
![Step Functions](https://img.shields.io/badge/Step%20Functions-FF4F8B?style=for-the-badge&logo=amazonaws&logoColor=white)
![DynamoDB](https://img.shields.io/badge/DynamoDB-4053D6?style=for-the-badge&logo=amazondynamodb&logoColor=white)
![Amazon S3](https://img.shields.io/badge/Amazon%20S3-569A31?style=for-the-badge&logo=amazons3&logoColor=white)
![SQS](https://img.shields.io/badge/Amazon%20SQS-FF4F8B?style=for-the-badge&logo=amazonaws&logoColor=white)
![SNS](https://img.shields.io/badge/Amazon%20SNS-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)
![API Gateway](https://img.shields.io/badge/API%20Gateway-FF4F8B?style=for-the-badge&logo=amazonaws&logoColor=white)
![Cognito](https://img.shields.io/badge/Cognito-DD344C?style=for-the-badge&logo=amazonaws&logoColor=white)
![CloudFront](https://img.shields.io/badge/CloudFront-232F3E?style=for-the-badge&logo=amazonaws&logoColor=white)
![EC2](https://img.shields.io/badge/EC2%20Spot-FF9900?style=for-the-badge&logo=amazonec2&logoColor=white)

### Vision & ALPR

![OpenCV](https://img.shields.io/badge/OpenCV-5C3EE8?style=for-the-badge&logo=opencv&logoColor=white)
![OpenALPR](https://img.shields.io/badge/OpenALPR-1a73e8?style=for-the-badge&logo=opencv&logoColor=white)
![Tesseract](https://img.shields.io/badge/Tesseract%20OCR-333333?style=for-the-badge&logo=google&logoColor=white)

### Frontend

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![HLS.js](https://img.shields.io/badge/HLS.js-E74430?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik04IDV2MTRsMTEtN3oiLz48L3N2Zz4=&logoColor=white)

### Mobile

![React Native](https://img.shields.io/badge/React%20Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)

### Streaming

![go2rtc](https://img.shields.io/badge/go2rtc-HLS%20Relay-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![RTSP](https://img.shields.io/badge/RTSP-Camera%20Ingest-555555?style=for-the-badge&logo=security&logoColor=white)

---

## Project Structure

```
WatchTell/
│
├── 📁 api/                         # Lambda handlers + Step Functions tasks
│   ├── clips.py                    #   Presigned URL generation for keyframes
│   ├── events.py                   #   List / fetch events
│   ├── plates.py                   #   All events for a plate number
│   ├── search.py                   #   Search by plate + date range
│   ├── watchlist.py                #   CRUD for watchlist entries
│   ├── pipeline/
│   │   ├── sqs_trigger.py          #   SQS → Step Functions bridge
│   │   ├── parse_result.py         #   Normalise ALPR output
│   │   ├── validate_plate.py       #   SearchQuarry / Upstash Redis cache
│   │   ├── store_event.py          #   Write event to DynamoDB
│   │   └── check_watchlist.py      #   SNS alert on watchlist hit
│   └── shared/
│       ├── auth.py                 #   Cognito JWT helpers
│       └── dynamo.py               #   DynamoDB query helpers
│
├── 📁 frontend/                    # React + TypeScript web dashboard
│   └── src/
│       ├── components/             #   EventCard, LiveFeed, VideoModal, PlateTag …
│       ├── pages/                  #   Events, Live, Search, Alerts, Settings
│       ├── hooks/                  #   useEvents, useSearch, useWebSocket
│       └── lib/                    #   api.ts, auth.ts, types.ts
│
├── 📁 mobile/                      # React Native / Expo companion app
│   └── src/
│       ├── components/             #   EventCard, PlateTag, VideoPlayer
│       └── screens/                #   Events, Live, Search, Alerts
│
├── 📁 infrastructure/              # AWS CDK (Python) — all stacks
│   └── watchtell/
│       ├── single_stack.py         #   ✅ Active — full system in one stack
│       ├── storage_stack.py        #   S3 buckets + DynamoDB tables
│       ├── queue_stack.py          #   SQS queues (ALPR, Results, DLQ)
│       ├── compute_stack.py        #   EC2 Spot ASG + IAM
│       ├── pipeline_stack.py       #   Step Functions + Lambda pipeline
│       ├── api_stack.py            #   API Gateway + Cognito + Lambda
│       ├── cdn_stack.py            #   CloudFront + SPA hosting
│       └── security_stack.py       #   WAF / extra security resources
│
├── 📁 relay/
│   └── camera_relay.py             # Runs on any device — RTSP → S3/SQS
│
├── 📁 worker/
│   ├── alpr_worker.py              # ALPR processing loop on EC2
│   ├── install.sh                  # Bootstrap script for EC2 / AMI build
│   ├── watchtell-alpr.service      # systemd service unit
│   └── watchtell-relay.service     # systemd service unit
│
└── 📁 scripts/
    ├── bootstrap.sh                # One-time dev environment setup
    ├── deploy.sh                   # Full CDK deploy + frontend publish
    ├── build-ami.sh                # Build reusable OpenALPR AMI
    ├── seed-events.py              # Seed test events into DynamoDB
    └── seed-watchlist.py           # Seed test watchlist entries
```

---

## Quick Start

### Prerequisites

| Requirement | Version |
|---|---|
| AWS CLI | configured with target account |
| Python | 3.12+ |
| Node.js | 18+ |
| AWS CDK CLI | `npm install -g aws-cdk` |
| Expo CLI | only if building the mobile app |

You will also need:

- An RTSP-capable IP camera on your network
- An AWS account in `us-east-1`

### 1 — Bootstrap the dev environment

```bash
git clone https://github.com/masterq1/WatchTell.git
cd WatchTell
./scripts/bootstrap.sh
```

This installs Python and Node dependencies, then bootstraps CDK for your AWS account.

### 2 — Deploy the AWS stack

```bash
cd infrastructure
cdk deploy WatchtellSingle \
  --parameters CameraRtspUrl="rtsp://<user>:<pass>@<ip>/stream1" \
  --parameters CameraId="cam-driveway"
```

> **First run:** the EC2 Spot instance compiles OpenALPR, OpenCV, and Tesseract from source (~20 min), then bakes a reusable AMI tagged `WatchTellWorker=true`. All future deploys launch instantly from that AMI.

On completion, CDK prints:

```
WatchtellSingle.DashboardUrl  = https://<id>.cloudfront.net
WatchtellSingle.ApiUrl        = https://<id>.execute-api.us-east-1.amazonaws.com
WatchtellSingle.UserPoolId    = us-east-1_XXXXXXXX
```

### 3 — Open the dashboard

Navigate to the `DashboardUrl` output, sign in with your Cognito user, and you'll see the live feed and event history.

### 4 — Run the web frontend locally (optional)

```bash
cp frontend/.env.example frontend/.env.local
# Fill in VITE_API_URL, VITE_USER_POOL_ID, VITE_USER_POOL_CLIENT_ID

cd frontend
npm install
npm run dev
```

### 5 — Run the mobile app (optional)

```bash
cp mobile/.env.example mobile/.env
cd mobile
npm install
npm start           # Expo QR code
# or:
npm run android
npm run ios
```

---

## Configuration Reference

### CDK Deploy Parameters

| Parameter | Description | Default |
|---|---|---|
| `CameraRtspUrl` | Full RTSP URL of your camera | *(required)* |
| `CameraHlsUrl` | HLS URL for live dashboard stream | *(optional)* |
| `CameraId` | Unique camera identifier | `cam-doorway` |
| `SearchQuarryApiKey` | Plate validation API key | `disabled` |
| `UpstashRedisUrl` | Redis URL for validation cache | `disabled` |
| `UpstashRedisToken` | Redis token | `disabled` |

### Camera Relay Environment Variables

| Variable | Description | Default |
|---|---|---|
| `CAMERA_ID` | Camera identifier (matches CDK parameter) | *(required)* |
| `RTSP_URL` | RTSP stream URL | *(required)* |
| `MEDIA_BUCKET` | S3 bucket name for keyframes | *(required)* |
| `QUEUE_URL` | SQS ALPR queue URL | *(required)* |
| `EVENT_TYPE` | `entry` / `exit` / `unknown` | `unknown` |
| `CAPTURE_FPS` | Frames evaluated per second | `1` |
| `MOTION_THRESHOLD` | Changed-pixel count to trigger upload | `2000` |
| `MIN_INTERVAL_SEC` | Min seconds between uploads | `3` |

### Frontend `.env.local`

```env
VITE_API_URL=https://<id>.execute-api.us-east-1.amazonaws.com
VITE_USER_POOL_ID=us-east-1_XXXXXXXX
VITE_USER_POOL_CLIENT_ID=<client-id>
VITE_GO2RTC_URL=https://go2rtc.example.com/api
VITE_CAMERAS=[{"id":"cam-driveway","name":"Driveway","stream":"Driveway_Main"}]
```

---

## Pipeline Deep-Dive

Each ALPR result flows through an AWS Step Functions Express Workflow:

```
SQS Results Queue
      │
      ▼
  SqsTrigger Lambda  ──▶  StartExecution
                                │
               ┌────────────────┼────────────────┐
               ▼                ▼                ▼
          ParseResult     ValidatePlate      (error → DLQ)
               │                │
               ▼                ▼
          StoreEvent    ←── (plate status)
               │
               ▼
         CheckWatchlist
               │
         ┌─────┴─────┐
         ▼           ▼
       (pass)     SNS Alert
                  (email)
```

| Step | Lambda | What it does |
|---|---|---|
| **ParseResult** | `api/pipeline/parse_result.py` | Normalises plate text (strip spaces, upper-case, region handling) |
| **ValidatePlate** | `api/pipeline/validate_plate.py` | Calls SearchQuarry API; caches result in Upstash Redis for 24 h |
| **StoreEvent** | `api/pipeline/store_event.py` | Writes event to DynamoDB with all metadata |
| **CheckWatchlist** | `api/pipeline/check_watchlist.py` | Queries watchlist table; publishes SNS message on match |

---

## Operator Dashboard

The React SPA at `https://<cloudfront-id>.cloudfront.net` provides:

| Page | Description |
|---|---|
| **Live** | HLS video feed with auto-retry on session expiry |
| **Events** | Scrollable feed of all plate events — keyframe thumbnail, plate tag, timestamp, camera ID |
| **Search** | Filter events by plate number and/or date range |
| **Alerts** | Watchlist management — add/remove flagged plates |
| **Settings** | Camera and system configuration |

### Plate Status Tags

| Tag | Colour | Meaning |
|---|---|---|
| `✓` | 🟢 Green | Valid / registered |
| `!` | 🟠 Orange | Registration expired |
| `⚠` | 🟡 Amber | Suspended |
| `⚠` | 🔴 Red (pulse) | Stolen — triggers alert |
| `?` | ⚪ Slate | Unknown / not validated |

---

## Camera Relay

The relay (`relay/camera_relay.py`) runs on any device with access to the camera and AWS — a Raspberry Pi, home lab server, or the same machine running go2rtc.

```bash
# Install dependencies
pip install opencv-python-headless boto3 python-dotenv

# Create .env in the relay directory
cat > relay/.env <<EOF
CAMERA_ID=cam-driveway
RTSP_URL=rtsp://admin:password@192.168.1.100/stream1
MEDIA_BUCKET=watchtellsingle-mediabucket-xxxxx
QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/WatchtellSingle-AlprQueue-xxxxx
EOF

python relay/camera_relay.py
```

### How Motion Detection Works

```
Frame N-1  ──▶  Greyscale + Gaussian blur
Frame N    ──▶  Greyscale + Gaussian blur
                        │
                   absdiff(N-1, N)
                        │
               Threshold @ 25 brightness
                        │
              Count white pixels (changed)
                        │
          changed_pixels ≥ MOTION_THRESHOLD?
                  Yes ──▶ Upload to S3 + enqueue
                   No ──▶ Skip frame
```

> **Tuning tip:** raise `MOTION_THRESHOLD` to reduce false triggers from lighting changes. Lower it to catch slow-moving vehicles. Set to `0` to upload every frame (high cost, not recommended).

---

## Deployment

### Single-Stack (current, recommended)

All AWS resources are defined in `infrastructure/watchtell/single_stack.py` and deployed as one CloudFormation stack:

```bash
cd infrastructure
cdk deploy WatchtellSingle --require-approval never
```

### Full CDK Deploy + Frontend Publish

```bash
./scripts/deploy.sh
```

This:

1. Deploys all CDK stacks
2. Builds the React frontend (`npm run build`)
3. Syncs `frontend/dist/` to the S3 SPA bucket
4. Invalidates the CloudFront distribution

### AMI Build

The first launch builds and bakes a custom AMI so future instances start in seconds:

```bash
# Trigger manually if needed
./scripts/build-ami.sh
```

The AMI is tagged `WatchTellWorker=true` and its ID is stored in SSM at `/watchtell/ami/latest`. CDK automatically selects the newest available tagged AMI on each synth.

---

## Plate Validation

Out of the box, plate validation returns `unknown` (no API key configured). To enable real-time registration status:

### Option A — SearchQuarry

1. Sign up at [searchquarry.com](https://www.searchquarry.com)
2. Obtain your API key from the account dashboard
3. Deploy with: `cdk deploy WatchtellSingle --parameters SearchQuarryApiKey="<key>"`

### Option B — Plate Recognizer

[platerecognizer.com](https://platerecognizer.com) offers a more accurate ALPR cloud API that can replace both the local OpenALPR step and the validation step.

### Redis Cache (recommended with either option)

Validation results are cached per plate for 24 hours using Upstash Redis, dramatically reducing API calls for repeat plates:

```bash
cdk deploy WatchtellSingle \
  --parameters UpstashRedisUrl="rediss://<id>.upstash.io:6380" \
  --parameters UpstashRedisToken="<token>"
```

---

## Motion Sensitivity Tuning

Adjust via SSM on the running EC2 instance:

```bash
# Connect via SSM Session Manager
aws ssm start-session --target <instance-id>

# Edit the service unit
sudo nano /etc/systemd/system/watchtell-alpr.service
# Set: Environment=MOTION_THRESHOLD=5000

sudo systemctl daemon-reload
sudo systemctl restart watchtell-alpr
```

| `MOTION_THRESHOLD` | Sensitivity | Use case |
|---|---|---|
| `0` | Capture everything | Testing / debugging |
| `500–1000` | Very high | Slow, distant vehicles |
| `2000` | Default | General use |
| `5000–10000` | Low | Busy scene — reduce noise |
| `50000+` | Very low | Only large foreground motion |

---

<div align="center">

Built with ☁️ AWS CDK · ⚙️ OpenALPR · ⚛️ React · 🐍 Python

</div>
