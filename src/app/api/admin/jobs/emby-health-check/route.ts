export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchSystemInfo } from "@/lib/emby";

function errText(x: any) {
  if (!x) return "unknown_error";
  return String(x?.error || x?.message || x);
}

export async function POST(req: Request) {
  const internalSecret = (process.env.INTERNAL_JOBS_SECRET ?? "").trim();
  const headerInternalSecret = (req.headers.get("x-internal-jobs-secret") ?? "").trim();

  if (internalSecret && headerInternalSecret) {
    if (internalSecret !== headerInternalSecret) return NextResponse.json({ error: "invalid_internal_jobs_secret" }, { status: 401 });
  } else {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const startedAt = new Date();
  const job = await prisma.jobRun.create({ data: { jobName: "emby-health-check", startedAt } });

  try {
    let servers: any[] = [];
    try {
      servers = await prisma.embyServer.findMany({
        where: { enabled: true },
        select: { id: true, name: true, baseUrl: true, externalUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
        orderBy: { createdAt: "asc" },
      });
    } catch {
      servers = await prisma.embyServer.findMany({
        where: { enabled: true },
        select: { id: true, name: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
        orderBy: { createdAt: "asc" },
      });
    }

  let okCount = 0;
  let failCount = 0;

  for (const s of servers) {
    const apiKey = getEmbyApiKeyForServer(s as any);
    const now = new Date();

    if (!apiKey) {
      failCount += 1;
      await prisma.embyServer.update({ where: { id: s.id }, data: { lastHealthAt: now, lastHealthOk: false, lastHealthMsg: "missing_api_key" } });
      continue;
    }

    try {
      const t0 = Date.now();
      const r = await embyFetchSystemInfo(s.baseUrl, apiKey);
      const ms = Date.now() - t0;
      if (r.ok) {
        okCount += 1;
        await prisma.embyServer.update({ where: { id: s.id }, data: { lastHealthAt: now, lastHealthOk: true, lastHealthMsg: `${ms}ms` } });
      } else {
        failCount += 1;
        await prisma.embyServer.update({ where: { id: s.id }, data: { lastHealthAt: now, lastHealthOk: false, lastHealthMsg: errText((r as any).error || (r as any).status || "health_check_failed") } });
      }
    } catch (e: any) {
      failCount += 1;
      await prisma.embyServer.update({ where: { id: s.id }, data: { lastHealthAt: now, lastHealthOk: false, lastHealthMsg: errText(e) } });
    }
  }

    const finishedAt = new Date();
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: true, message: JSON.stringify({ total: servers.length, okCount, failCount }) } });
    return NextResponse.json({ ok: true, total: servers.length, okCount, failCount, jobRunId: job.id });
  } catch (e: any) {
    const finishedAt = new Date();
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: false, message: String(e?.message ?? e) } });
    return NextResponse.json({ error: "job_failed", message: String(e?.message ?? e), jobRunId: job.id }, { status: 500 });
  }
}
