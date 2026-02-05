## Background workers

This folder contains background worker entrypoints.

### anomaly scan worker

Runs a BullMQ repeatable job every 10 minutes and triggers the internal scan endpoint.

Env:
- `REDIS_URL`
- `INTERNAL_JOBS_SECRET`
- `WEB_INTERNAL_URL` (default `http://localhost:3000`)

Docker Compose starts it as service `worker`.
