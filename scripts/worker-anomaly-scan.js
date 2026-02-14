/*
  BullMQ worker/scheduler for anomaly scan.

  - Registers a repeatable job (every 10 minutes) in Redis.
  - Executes by calling the internal web endpoint.

  Required env:
    - REDIS_URL
    - INTERNAL_JOBS_SECRET
    - WEB_INTERNAL_URL (default: http://localhost:3000)
*/

const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");

// Node 22 has global fetch; keep for clarity.
// eslint-disable-next-line no-undef
const fetch = global.fetch;

const REDIS_URL = (process.env.REDIS_URL || "").trim();
if (!REDIS_URL) {
  console.error("Missing env REDIS_URL");
  process.exit(1);
}

const INTERNAL_JOBS_SECRET = (process.env.INTERNAL_JOBS_SECRET || "").trim();
if (!INTERNAL_JOBS_SECRET) {
  console.error("Missing env INTERNAL_JOBS_SECRET");
  process.exit(1);
}

const WEB_INTERNAL_URL = (process.env.WEB_INTERNAL_URL || "http://localhost:3000").replace(/\/+$/, "");

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const queueName = "embypanel-anomaly-scan";

async function ensureRepeatable(queue) {
  // 清理历史重复任务（例如旧的10分钟scan），避免沿用旧节奏
  const all = await queue.getRepeatableJobs();
  for (const r of all) {
    if (r?.name === "scan" || r?.name === "unban" || r?.name === "cache-cleanup") {
      await queue.removeRepeatableByKey(r.key);
    }
  }

  // Stable jobId so it is idempotent.
  await queue.add(
    "scan",
    { kind: "anomaly-scan" },
    {
      jobId: "repeat:scan",
      repeat: { every: 5 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: 1000,
    }
  );

  await queue.add(
    "unban",
    { kind: "anomaly-unban" },
    {
      jobId: "repeat:unban",
      repeat: { every: 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: 1000,
    }
  );

  await queue.add(
    "cache-cleanup",
    { kind: "cache-cleanup" },
    {
      jobId: "repeat:cache-cleanup",
      repeat: { pattern: "0 2 * * *", tz: "Asia/Shanghai" },
      removeOnComplete: true,
      removeOnFail: 1000,
    }
  );
}

async function callInternal(path) {
  const url = WEB_INTERNAL_URL + path;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-jobs-secret": INTERNAL_JOBS_SECRET,
    },
    body: JSON.stringify({}),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} failed HTTP ${res.status}: ${text.slice(0, 5000)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  const queue = new Queue(queueName, { connection });

  await ensureRepeatable(queue);
  console.log(`[worker] repeatable job ensured: ${queueName} every 5min -> ${WEB_INTERNAL_URL}`);

  const worker = new Worker(
    queueName,
    async (job) => {
      if (job.name === "unban") {
        const unban = await callInternal("/api/admin/jobs/anomaly-unban");
        if ((unban?.dueCount || 0) > 0) {
          console.log("[worker] anomaly-unban", { jobId: job.id, due: unban?.dueCount, unbanned: unban?.unbanned, skipped: unban?.skipped, failed: unban?.failed });
        }
        return { unban };
      }

      if (job.name === "cache-cleanup") {
        const cleanup = await callInternal("/api/admin/jobs/cache-cleanup");
        console.log("[worker] cache-cleanup", { jobId: job.id, snapshotsDeleted: cleanup?.snapshotsDeleted, jobRunsDeleted: cleanup?.jobRunsDeleted, emailCodesPruned: cleanup?.emailCodesPruned });
        return { cleanup };
      }

      const started = Date.now();
      const health = await callInternal("/api/admin/jobs/emby-health-check");
      const expiryDisable = await callInternal("/api/admin/jobs/subscription-expiry-disable");
      const expiryReminder = await callInternal("/api/admin/jobs/subscription-expiry-reminder");
      const result = await callInternal("/api/admin/jobs/anomaly-scan");
      const ms = Date.now() - started;
      console.log(`[worker] periodic jobs ok in ${ms}ms`, {
        jobId: job.id,
        healthOk: health?.okCount,
        healthFail: health?.failCount,
        expiryUsers: expiryDisable?.usersScanned,
        expiryLinksDisabled: expiryDisable?.linksDisabled,
        expiryWarnings: expiryDisable?.apiWarnings,
        reminderChecked: expiryReminder?.checked,
        reminderSent: expiryReminder?.sent,
        reminderErrors: expiryReminder?.errors,
        createdEvents: result?.createdEvents,
        scannedSessions: result?.scannedSessions,
        warnings: result?.warnings,
        penaltiesApplied: result?.penaltiesApplied,
      });
      return { health, expiryDisable, expiryReminder, anomaly: result };
    },
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("failed", (job, err) => {
    console.error("[worker] job failed", { jobId: job?.id, err: String(err?.message ?? err) });
  });

  // Keep process alive
  console.log("[worker] started");
}

main().catch((e) => {
  console.error("[worker] fatal", e);
  process.exit(1);
});
