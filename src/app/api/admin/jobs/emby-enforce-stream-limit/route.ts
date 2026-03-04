export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyEnforceSingleDevicePlayback } from "@/lib/emby-provision";

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
  const job = await prisma.jobRun.create({ data: { jobName: "emby-enforce-stream-limit", startedAt } });

  try {
    const servers = await prisma.embyServer.findMany({
      where: { enabled: true },
      select: { id: true, name: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
      orderBy: { createdAt: "asc" },
    });

    let totalLinks = 0;
    let updated = 0;
    let failed = 0;

    for (const s of servers) {
      const apiKey = getEmbyApiKeyForServer(s);
      if (!apiKey) continue;

      const links = await prisma.embyUserLink.findMany({
        where: { embyServerId: s.id, disabled: false },
        select: { embyUserId: true },
      });

      const embyUserIds = Array.from(new Set(links.map((x) => String(x.embyUserId || "").trim()).filter(Boolean)));
      totalLinks += embyUserIds.length;

      for (const embyUserId of embyUserIds) {
        try {
          const r = await embyEnforceSingleDevicePlayback(s.baseUrl, apiKey, embyUserId);
          if (r.ok) updated += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
    }

    const finishedAt = new Date();
    await prisma.jobRun.update({
      where: { id: job.id },
      data: { finishedAt, ok: failed === 0, message: JSON.stringify({ totalLinks, updated, failed }) },
    });

    return NextResponse.json({ ok: failed === 0, totalLinks, updated, failed, jobRunId: job.id });
  } catch (e: any) {
    const finishedAt = new Date();
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: false, message: String(e?.message ?? e) } });
    return NextResponse.json({ error: "job_failed", message: String(e?.message ?? e), jobRunId: job.id }, { status: 500 });
  }
}
