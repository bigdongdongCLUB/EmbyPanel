## Background workers

This folder contains background worker entrypoints.

### periodic worker

Runs a BullMQ repeatable job every 10 minutes and triggers:
- Emby health check endpoint
- anomaly scan endpoint

Env:
- `REDIS_URL`
- `INTERNAL_JOBS_SECRET`
- `WEB_INTERNAL_URL` (default `http://localhost:3000`)

Docker Compose starts it as service `worker`.
