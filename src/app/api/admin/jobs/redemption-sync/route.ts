export const runtime = "nodejs";
export const maxDuration = 300;
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { syncRedeemedSubscription } from "@/lib/redemption-sync";

export async function POST(req: Request) {
  const secret = process.env.INTERNAL_JOBS_SECRET?.trim();
  if (!secret || req.headers.get("x-internal-jobs-secret") !== secret) {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const jobs = await prisma.redemptionSyncJob.findMany({ where: { status: "PENDING", nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: "asc" }, take: 2, select: { id: true } });
  let completed = 0;
  for (const job of jobs) {
    try { if (await syncRedeemedSubscription(job.id)) completed++; }
    catch { console.warn("redemption_sync_job_failed", { jobId: job.id }); }
  }
  return NextResponse.json({ ok: true, checked: jobs.length, completed });
}
