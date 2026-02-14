export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const internalSecret = (process.env.INTERNAL_JOBS_SECRET ?? "").trim();
  const headerInternalSecret = (req.headers.get("x-internal-jobs-secret") ?? "").trim();

  if (internalSecret && headerInternalSecret) {
    if (internalSecret !== headerInternalSecret) return NextResponse.json({ error: "invalid_internal_jobs_secret" }, { status: 401 });
  } else {
    const token = (process.env.EMBYPANEL_JOB_TOKEN ?? "").trim();
    const headerToken = (req.headers.get("x-job-token") ?? "").trim();

    if (token && headerToken) {
      if (token !== headerToken) return NextResponse.json({ error: "invalid_job_token" }, { status: 401 });
    } else {
      const auth = await requireAdmin();
      if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  }

  const startedAt = new Date();
  const job = await prisma.jobRun.create({ data: { jobName: "cache-cleanup", startedAt } });

  try {
    const snapshotsBefore = await prisma.sessionSnapshot.count();
    const snapshotCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const deletedSnapshots = await prisma.sessionSnapshot.deleteMany({ where: { capturedAt: { lt: snapshotCutoff } } });

    const jobRunCutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const deletedJobRuns = await prisma.jobRun.deleteMany({ where: { startedAt: { lt: jobRunCutoff }, jobName: { not: "cache-cleanup" } } });

    let emailCodesPruned = 0;
    const codeRow = await prisma.appSetting.findUnique({ where: { key: "register_email_codes" } });
    const codeMap = ((codeRow?.valueJson as any) ?? {}) as Record<string, { code?: string; expiresAt?: number }>;
    if (codeMap && typeof codeMap === "object" && !Array.isArray(codeMap)) {
      const now = Date.now();
      const next: Record<string, { code?: string; expiresAt?: number }> = {};
      for (const [k, v] of Object.entries(codeMap)) {
        if (!v || Number(v.expiresAt || 0) < now) {
          emailCodesPruned += 1;
          continue;
        }
        next[k] = v;
      }
      await prisma.appSetting.upsert({
        where: { key: "register_email_codes" },
        create: { key: "register_email_codes", valueJson: next },
        update: { valueJson: next },
      });
    }

    const finishedAt = new Date();
    const message = {
      snapshotsBefore,
      snapshotsDeleted: deletedSnapshots.count,
      jobRunsDeleted: deletedJobRuns.count,
      emailCodesPruned,
    };

    await prisma.jobRun.update({
      where: { id: job.id },
      data: { finishedAt, ok: true, message: JSON.stringify(message) },
    });

    return NextResponse.json({ ok: true, ...message, startedAt, finishedAt });
  } catch (e: any) {
    const finishedAt = new Date();
    const msg = String(e?.message ?? e);
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: false, message: msg } });
    return NextResponse.json({ error: "cache_cleanup_failed", message: msg }, { status: 500 });
  }
}
