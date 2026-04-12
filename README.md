# WatchTell

WatchTell is an AWS-based vehicle surveillance system for monitoring property access by license plate. It captures motion-triggered frames from IP cameras, runs automatic license plate recognition (ALPR), stores vehicle events, and alerts operators when a detected plate appears on a watchlist.

## What It Does

At a high level, WatchTell:

- Connects to RTSP camera feeds
- Detects motion and captures keyframes
- Uploads keyframes to S3
- Queues ALPR jobs in SQS
- Runs OpenALPR on an EC2 Spot worker
- Normalizes and validates detected plate numbers
- Stores events in DynamoDB
- Checks a watchlist and sends SNS alerts on hits
- Exposes a protected API for events, search, watchlist management, and clip access
- Provides a web dashboard and mobile app for operators

## Repository Layout

```text
/api             Lambda handlers and Step Functions pipeline tasks
/frontend        React + TypeScript web dashboard
/infrastructure  AWS CDK stacks for the full system
/mobile          React Native / Expo mobile app
/relay           Camera relay for RTSP ingest, motion detection, and S3/SQS upload
/scripts         Deployment and utility scripts
/worker          EC2 ALPR worker and live HLS relay services
```

## End-to-End Flow

### 1. Camera ingest and motion-triggered capture

The camera relay connects to an RTSP stream, performs basic motion detection, uploads a JPEG keyframe to S3, and sends a job to SQS.

Relevant file:

- [relay/camera_relay.py](./relay/camera_relay.py)

### 2. ALPR processing on EC2

An EC2 Spot instance runs the ALPR worker as a systemd service. It reads jobs from the ALPR queue, downloads the keyframe from S3, runs OpenALPR, selects the highest-confidence candidate, and publishes the result to a results queue.

Relevant file:

- [worker/alpr_worker.py](./worker/alpr_worker.py)

### 3. Step Functions pipeline

A Lambda triggered by the results queue starts a Step Functions execution for each ALPR result. The pipeline:

1. Parses and normalizes the plate text
2. Validates the plate via SearchQuarry, using Upstash Redis as a cache
3. Stores the event in DynamoDB
4. Checks the watchlist and publishes an SNS alert on a hit

Relevant files:

- [api/pipeline/sqs_trigger.py](./api/pipeline/sqs_trigger.py)
- [api/pipeline/parse_result.py](./api/pipeline/parse_result.py)
- [api/pipeline/validate_plate.py](./api/pipeline/validate_plate.py)
- [api/pipeline/store_event.py](./api/pipeline/store_event.py)
- [api/pipeline/check_watchlist.py](./api/pipeline/check_watchlist.py)

### 4. API layer

The API is served through API Gateway + Lambda with Cognito JWT authentication. It exposes routes for:

- Listing events
- Fetching a specific event
- Searching by plate/date
- Looking up all events for a plate
- Managing the watchlist
- Generating pre-signed URLs for media clips

Relevant files:

- [infrastructure/watchtell/api_stack.py](./infrastructure/watchtell/api_stack.py)
- [api/events.py](./api/events.py)
- [api/search.py](./api/search.py)
- [api/plates.py](./api/plates.py)
- [api/watchlist.py](./api/watchlist.py)
- [api/clips.py](./api/clips.py)

### 5. Operator interfaces

The repo includes two operator-facing clients:

- A React web dashboard with pages for Live, Events, Search, Alerts, and Settings
- A React Native mobile app with tabs for Live, Events, Search, and Alerts

Relevant files:

- [frontend/src/App.tsx](./frontend/src/App.tsx)
- [mobile/App.tsx](./mobile/App.tsx)

## AWS Architecture

The infrastructure is defined in CDK and composed from multiple stacks:

- Storage: S3 buckets and DynamoDB tables
- Queue: ALPR job queue, results queue, and DLQ
- Compute: EC2 Spot worker ASG and IAM wiring
- Pipeline: Step Functions, Lambdas, SNS alerts
- API: API Gateway, Cognito, Lambda handlers
- CDN: CloudFront, SPA hosting, HLS bucket and routing
- Security: Additional security resources and protections

Main entrypoint:

- [infrastructure/app.py](./infrastructure/app.py)

## How To Run It

This repo is split across infrastructure, backend Lambdas, a web frontend, a mobile app, and camera/worker processes. In practice, there are two main ways to run it:

- Run the frontend or mobile app locally against deployed AWS services
- Deploy the full AWS stack and then attach cameras/workers

### Prerequisites

You will need:

- AWS CLI configured with credentials for the target account
- Python 3.12 and `pip`
- Node.js and `npm`
- AWS CDK CLI installed
- Expo CLI tooling if you want to run the mobile app

For full end-to-end operation, you will also need:

- At least one RTSP camera feed
- An AWS account in `us-east-1`
- External service credentials for plate validation

### One-Time Bootstrap

The repo includes a bootstrap script that installs dependencies and bootstraps CDK:

```bash
./scripts/bootstrap.sh
```

What it does:

- Installs infrastructure Python dependencies
- Runs `cdk bootstrap`
- Installs frontend dependencies
- Installs mobile dependencies

Relevant file:

- [scripts/bootstrap.sh](./scripts/bootstrap.sh)

### Deploy The AWS Stack

To deploy the infrastructure and publish the frontend:

```bash
./scripts/deploy.sh
```

To deploy infrastructure without rebuilding the frontend:

```bash
./scripts/deploy.sh --skip-frontend
```

What this script does:

- Deploys all CDK stacks
- Packages the worker and uploads it to `watchtell-deploy`
- Builds the frontend
- Syncs the frontend build to the SPA bucket
- Invalidates the CloudFront distribution

Relevant file:

- [scripts/deploy.sh](./scripts/deploy.sh)

### Run The Web Frontend Locally

1. Copy the example env file:

```bash
cp frontend/.env.example frontend/.env.local
```

2. Fill in the values from your deployed AWS resources:

- `VITE_API_URL`
- `VITE_WS_URL`
- `VITE_USER_POOL_ID`
- `VITE_USER_POOL_CLIENT_ID`

3. Start the app:

```bash
cd frontend
npm install
npm run dev
```

4. For a production build:

```bash
cd frontend
npm run build
npm run preview
```

Relevant files:

- [frontend/.env.example](./frontend/.env.example)
- [frontend/package.json](./frontend/package.json)

### Run The Mobile App Locally

1. Copy the example env file and fill in the Cognito/API values:

```bash
cp mobile/.env.example mobile/.env
```

2. Start Expo:

```bash
cd mobile
npm install
npm start
```

3. Or run directly on a target platform:

```bash
cd mobile
npm run android
```

```bash
cd mobile
npm run ios
```

Relevant files:

- [mobile/.env.example](./mobile/.env.example)
- [mobile/package.json](./mobile/package.json)

### Run The API Code Locally

There is no dedicated local API server in this repo. The `api/` directory contains AWS Lambda handlers that are intended to run behind API Gateway after CDK deployment.

You can install their dependencies locally for testing or direct invocation:

```bash
cd api
pip install -r requirements.txt
```

Relevant files:

- [api/requirements.txt](./api/requirements.txt)
- [api/events.py](./api/events.py)

### Run The Camera Relay

The relay can run on any machine that can reach both the RTSP camera and AWS.

Set these environment variables first:

- `CAMERA_ID`
- `RTSP_URL`
- `EVENT_TYPE`
- `MEDIA_BUCKET`
- `QUEUE_URL`
- `AWS_REGION`

Then run:

```bash
cd relay
python camera_relay.py
```

This captures motion-triggered frames, uploads them to S3, and enqueues ALPR jobs.

Relevant file:

- [relay/camera_relay.py](./relay/camera_relay.py)

### Run The Worker

The worker is designed to run on EC2 and is normally installed by the infrastructure and deployment flow, not launched manually on a developer machine.

If you want to inspect its Python dependencies locally:

```bash
cd worker
pip install -r requirements.txt
```

The real runtime setup happens through:

- [worker/install.sh](./worker/install.sh)
- [worker/alpr_worker.py](./worker/alpr_worker.py)
- [infrastructure/watchtell/compute_stack.py](./infrastructure/watchtell/compute_stack.py)

### Required External Configuration

For the validation and alert pipeline to fully work, the deployed environment expects SSM parameters for:

- `/watchtell/searchquarry/api_key`
- `/watchtell/upstash/url`
- `/watchtell/upstash/token`

Without those values, plate validation will fall back to `unknown`.

## Current State

This repo is more than a mockup. The core backend path is real and fairly complete:

- Camera relay exists
- ALPR worker exists
- AWS deployment code exists
- Event storage/search/watchlist APIs exist
- Watchlist alerting pipeline exists

Some product areas are still incomplete or partially wired:

- The web app expects real-time WebSocket updates, but matching backend real-time infrastructure is not obvious in this repo
- The mobile live view is still a placeholder
- Settings/configuration UX is minimal
- Some parts of the design doc are more ambitious than what is currently implemented

## Key Files To Start With

- [CLAUDE.md](./CLAUDE.md)
- [infrastructure/app.py](./infrastructure/app.py)
- [relay/camera_relay.py](./relay/camera_relay.py)
- [worker/alpr_worker.py](./worker/alpr_worker.py)
- [infrastructure/watchtell/pipeline_stack.py](./infrastructure/watchtell/pipeline_stack.py)
- [infrastructure/watchtell/api_stack.py](./infrastructure/watchtell/api_stack.py)
- [frontend/src/App.tsx](./frontend/src/App.tsx)
- [mobile/App.tsx](./mobile/App.tsx)

## Summary

WatchTell is a low-cost, AWS-hosted license plate surveillance platform for property monitoring. It is designed to detect vehicles from camera feeds, recognize and validate plate numbers, retain searchable event history, and notify operators when a flagged vehicle appears.
