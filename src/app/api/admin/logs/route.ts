export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

type Level = "ERROR" | "WARN" | "INFO" | "DEBUG";

function parseJobLevel(ok: boolean | null, msg: string | null): Level {
  if (ok === false) return "ERROR";
  const text = String(msg || "").toLowerCase();
  if (text.includes("warn") || text.includes("warning") || text.includes("skipped")) return "WARN";
  return "INFO";
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 200), 20), 500);

  const [jobRuns, anomalies] = await Promise.all([
    prisma.jobRun.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        id: true,
        jobName: true,
        startedAt: true,
        finishedAt: true,
        ok: true,
        message: true,
      },
    }),
    prisma.anomaly.findMany({
      orderBy: { detectedAt: "desc" },
      take: Math.min(limit, 100),
      select: {
        id: true,
        detectedAt: true,
        status: true,
        evidenceJson: true,
        note: true,
        user: { select: { username: true } },
        embyServer: { select: { name: true } },
      },
    }),
  ]);

  const logs = [
    ...jobRuns.map((j, i) => ({
      id: `job-${j.id}`,
      timestamp: j.finishedAt ?? j.startedAt,
      level: parseJobLevel(j.ok, j.message),
      source: `[job:${j.jobName}]`,
      message: j.message || (j.ok === false ? "任务失败" : "任务完成"),
    })),
    ...anomalies.map((a) => {
      const evidence = (a.evidenceJson as any) ?? {};
      const label = evidence?.anomalyTypeLabel || "异常并发播放";
      return {
        id: `anomaly-${a.id}`,
        timestamp: a.detectedAt,
        level: a.status === "OPEN" ? "WARN" : "INFO",
        source: `[anomaly:${a.embyServer?.name || "server"}]`,
        message: `${a.user?.username || "unknown"} - ${label}${a.note ? ` - ${a.note}` : ""}`,
      };
    }),
  ]
    .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
    .slice(0, limit)
    .map((x, i) => ({ ...x, timestamp: new Date(x.timestamp).toISOString(), seq: i + 1 }));

  return NextResponse.json({ ok: true, logs });
}
