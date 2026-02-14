## Background workers

This folder contains background worker entrypoints.

### periodic worker

Runs BullMQ repeatable jobs and triggers:
- Every **5 minutes**: anomaly scan + health check + expiry disable + expiry reminder
- Every **1 minute**: anomaly unban

Env:
- `REDIS_URL`
- `INTERNAL_JOBS_SECRET`
- `WEB_INTERNAL_URL` (default `http://localhost:3000`)

### keepalive

- `run-worker.sh`: starts worker with `.env`
- `ensure-worker.sh`: single-shot watchdog (if worker is down, start it)
- `worker-keeper.sh`: loop watchdog (calls `ensure-worker.sh` every 60s)

Use `worker-keeper.sh` to avoid silent worker stoppage.

Docker Compose starts it as service `worker`. 
