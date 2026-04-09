# WatchTell

## Project Overview

WatchTell is a property surveillance system that monitors and records vehicles
entering and exiting a property via license plate recognition. It detects and
stores plate numbers, records short video clips of each event, validates plates
against external APIs, and provides a searchable event database with alerting
for watchlist hits.

Hosted entirely on AWS. Professional-quality UI on both desktop web and mobile.
Designed for minimum monthly cost.

---

## Project Structure

```
/watchtell
  /infrastructure   — AWS CDK (Python) — all AWS resource definitions
  /worker           — EC2 ALPR worker (Python) — SQS consumer + OpenALPR
  /api              — API Gateway Lambda handlers (Python)
  /frontend         — React 18 + TypeScript SPA (Vite)
  /mobile           — React Native (Expo)
  /scripts          — Deployment and utility scripts
  CLAUDE.md         — This file
```

---

## Tech Stack

### Backend
- Language: Python 3.12
- IaC: AWS CDK (Python)
- Package manager: pip
- ALPR engine: OpenALPR (open source, self-hosted on EC2)

### Frontend
- Framework: React 18 + TypeScript
- Bundler: Vite
- Package manager: npm
- Styling: Tailwind CSS

### Mobile
- Framework: React Native (Expo SDK 51+)
- Package manager: npm

---

## AWS Architecture

### Region
- Primary: us-east-1
- Naming prefix: `watchtell-`

### Edge / Ingest
- IP cameras (RTSP/ONVIF, 1080p minimum)
- Optional Raspberry Pi 5 or Intel NUC as RTSP relay + ffmpeg frame extractor
- Kinesis Video Streams — live stream ingest
- S3 (Intelligent-Tiering) — clip and keyframe storage, 365-day default retention
- SQS — async job queue for ALPR processing (visibility timeout: 90s)

### Compute — ALPR Worker
- EC2 Auto Scaling Group (desired: 1, min: 1, max: 1)
- Spot instance — multi-instance pool, price-capacity-optimized strategy
- SpotMaxPrice: $0.0096/hr (~$7/mo hard cap)
- Instance pool (cheapest available wins):
  - t4g.small, t4g.medium (ARM/Graviton2)
  - t3a.small, t3a.medium
  - t3.small, t3.medium
  - m6g.medium
  - m5a.large, m5.large
- InstanceInterruptionBehavior: stop (persistent spot request)
- ASG lifecycle hook: 90s termination drain
- Worker runs as systemd service: `watchtell-alpr.service`
- Termination watcher thread polls EC2 metadata (IMDSv2) every 5s
- On termination notice: sets shutdown flag, exits cleanly within 2-minute window

### AI / Processing
- Lambda (Python 3.12) — ALPR result parsing, clip extraction, validation API calls, alert dispatch
- Step Functions — orchestrates full event pipeline:
  detect → extract → validate plate → store → alert (if watchlist hit)
- MediaConvert (optional) — transcode clips to H.264 MP4 for browser playback

### Storage / Database
- DynamoDB (on-demand pricing) — all event records, plate records, watchlist
  - GSI on: PlateNumber, CameraId+Timestamp, EventType
- S3 (Intelligent-Tiering) — video clips and keyframes
- Upstash Redis — plate validation cache (24hr TTL per plate, ~$0–2/mo)

### API / Auth / CDN
- API Gateway (HTTP API) — REST endpoints
- Cognito — user pools, MFA, JWT auth
- CloudFront — SPA hosting + pre-signed media CDN
- WAF + Shield Standard — rate limiting, bot protection
- KMS — encryption at rest for S3 and DynamoDB
- CloudTrail — audit log of all plate lookups and searches
- SNS — alerts via email + push (APNs/FCM)

---

## Plate Validation

All lookups are plate-number-first (no VIN available at detection time).

Validation chain:
1. **Upstash Redis cache** — 24hr TTL per plate, skip API calls on hit
2. **SearchQuarry** plate lookup API — direct plate → registration status

Result codes: `valid` | `expired` | `suspended` | `stolen` | `unregistered` | `unknown`

Cache all results in Upstash Redis for 24 hours per plate to minimize API cost.

### Required SSM Parameters
| Parameter | Value |
|---|---|
| `/watchtell/searchquarry/api_key` | SearchQuarry API key |
| `/watchtell/upstash/url` | Upstash Redis REST URL |
| `/watchtell/upstash/token` | Upstash Redis REST token |

---

## Frontend — Web (Desktop Priority)

### Layout (Desktop ≥1280px)
```
┌───────────────────────────────────────────────────────────────────┐
│  [WatchTell]  [Live]  [Events]  [Search]  [Alerts]  [Settings]   │
├───────────────┬───────────────────────────────────────────────────┤
│  LIVE FEED    │  EVENT FEED (real-time WebSocket, newest first)   │
│  [camera 1]   │  [thumb] PLT-1234 | 04-07 14:32 | ✓ Valid        │
│  [camera 2]   │  [thumb] PLT-9988 | 04-07 14:15 | ⚠ Stolen       │
│               │  [thumb] PLT-4421 | 04-07 13:50 | ? Unknown      │
├───────────────┴───────────────────────────────────────────────────┤
│  SEARCH: [Plate number...]  [Date range]  [GO]                    │
└───────────────────────────────────────────────────────────────────┘
```

### Responsive Breakpoints
- Desktop ≥1280px: full split-panel layout
- Tablet 768–1279px: collapsible left panel
- Mobile <768px: single column (defer to React Native app)

### Design
- Dark mode default, light mode toggle
- Color palette: deep charcoal base, amber/gold for alerts, green for valid, red for flagged
- Typography: IBM Plex Mono for plate numbers and timestamps; Inter for UI chrome
- Real-time event feed via WebSocket/SSE — no polling
- Loading skeletons on all async data components
- Accessibility: WCAG 2.1 AA minimum

---

## Frontend — Mobile (React Native / Expo)

- Bottom tab navigation: Live | Events | Search | Alerts
- Push notifications via SNS → APNs/FCM
- Video clips in native modal player
- Plate search by typed input or camera capture

---

## Cost Target

Monthly cost at ~50 events/day, 2 cameras, 365-day retention:

| Service                  | Target Cost/mo |
|--------------------------|----------------|
| S3 Intelligent-Tiering   | ~$4–8          |
| Kinesis Video Streams    | ~$5–10         |
| Lambda (all functions)   | ~$1–3          |
| DynamoDB (on-demand)     | ~$1–2          |
| EC2 Spot (multi-pool)    | ~$3.60–7.00    |
| Upstash Redis            | ~$0–2          |
| CloudFront + API Gateway | ~$1–2          |
| SNS                      | <$1            |
| **Total**                | **~$16–35/mo** |

Key cost controls:
- Motion-triggered recording only (no 24/7 continuous recording)
- OpenALPR on EC2 (no per-call ALPR API cost)
- S3 Intelligent-Tiering (auto cold-tier for old clips)
- Upstash Redis plate cache (reduces external validation API calls ~80%)
- DynamoDB on-demand (scales to zero at no traffic)
- Spot instance hard cap at $0.0096/hr

---

## Development Phases

| Phase | Deliverables                                                                 | Status  |
|-------|------------------------------------------------------------------------------|---------|
| 1     | EC2 Spot ASG, OpenALPR worker, SQS ingest, DynamoDB schema, S3 clip storage | Current |
| 2     | Step Functions pipeline, plate validation API, Upstash cache, SNS alerts     | Pending |
| 3     | API Gateway routes, Cognito auth, pre-signed clip URLs                       | Pending |
| 4     | React SPA — desktop layout, live feed, event feed, plate search              | Pending |
| 5     | React Native app — mobile layout, push notifications                         | Pending |
| 6     | WAF, GuardDuty, KMS, CloudTrail, load testing, hardening                     | Pending |

---

## Key Naming Conventions

| Resource              | Name                          |
|-----------------------|-------------------------------|
| ASG                   | watchtell-alpr-asg            |
| Launch Template       | watchtell-alpr-spot           |
| EC2 IAM Role          | watchtell-ec2-role            |
| Systemd service       | watchtell-alpr.service        |
| Deploy S3 bucket      | watchtell-deploy              |
| DynamoDB events table | watchtell-events              |
| DynamoDB watchlist    | watchtell-watchlist           |
| SQS queue             | watchtell-alpr-queue          |
| SNS topic             | watchtell-alerts              |
| Cognito user pool     | watchtell-users               |
| CloudFront dist       | watchtell-cdn                 |

---

## Key References

| Resource                  | URL                                                                                   |
|---------------------------|---------------------------------------------------------------------------------------|
| OpenALPR (open source)    | https://github.com/openalpr/openalpr                                                  |
| Plate Recognizer API      | https://platerecognizer.com/docs/                                                     |
| AWS Kinesis Video Streams | https://docs.aws.amazon.com/kinesisvideostreams/latest/dg/what-is-kinesis-video.html  |
| AWS Step Functions        | https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html                    |
| EC2 Spot Pricing          | https://aws.amazon.com/ec2/spot/pricing/                                              |
| Upstash Redis             | https://upstash.com/docs/redis/overall/getstarted                                     |
| NICB Vehicle Check        | https://www.nicb.org/vincheck                                                         |
| AWS CDK (Python)          | https://docs.aws.amazon.com/cdk/v2/guide/work-with-cdk-python.html                   |