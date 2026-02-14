export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";


const PENALTY_CONFIG_KEY = "anomaly_penalty_config";
const PENALTY_RECORDS_KEY = "anomaly_penalty_records";

function normalizePenaltyConfig(v: any) {
  const enabled = typeof v?.enabled === "boolean" ? v.enabled : true;
  const d = Number(v?.durationMinutes ?? 5);
  const durationMinutes = Number.isFinite(d) ? Math.max(1, Math.min(120, Math.trunc(d))) : 5;
  return { enabled, durationMinutes };
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const serverId = (url.searchParams.get("serverId") ?? "").trim();
  const rangeDays = Math.max(1, Math.min(30, Number(url.searchParams.get("rangeDays") ?? "7") || 7));
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.max(10, Math.min(200, Number(url.searchParams.get("pageSize") ?? "10") || 10));

  const since = new Date(Date.now() - rangeDays * 24 * 3600 * 1000);

  const where: any = {
    type: "MULTI_DEVICE_CONCURRENCY",
    detectedAt: { gte: since },
    ...(serverId ? { embyServerId: serverId } : {}),
    ...(q ? { user: { username: { contains: q, mode: "insensitive" } } } : {}),
  };

  const [rows, total, penaltyConfigRow, penaltyRecordsRow] = await Promise.all([
    prisma.anomaly.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        detectedAt: true,
        embyServer: { select: { id: true, name: true } },
        user: { select: { id: true, username: true } },
        evidenceJson: true,
      },
    }),
    prisma.anomaly.count({ where }),
    prisma.appSetting.findUnique({ where: { key: PENALTY_CONFIG_KEY } }),
    prisma.appSetting.findUnique({ where: { key: PENALTY_RECORDS_KEY } }),
  ]);

  const distinctUsers = await prisma.anomaly.findMany({
    where,
    distinct: ["userId"],
    select: { userId: true },
  });

  const anomalies = rows.map((r) => {
    const ev: any = r.evidenceJson ?? {};
    const sessions = Array.isArray(ev.sessions) ? ev.sessions : [];
    const ips = Array.from(new Set(sessions.map((s: any) => String(s.ip ?? "").trim()).filter(Boolean)));
    const sessionCount = Number(ev.sessionCount ?? sessions.length ?? 0);

    return {
      id: r.id,
      detectedAt: r.detectedAt,
      server: r.embyServer,
      user: { id: r.user.id, name: r.user.username },
      type: "MULTI_DEVICE",
      sessionCount,
      ips,
      description: ev.description ?? (sessionCount >= 2 ? `同一时间检测到 ${sessionCount} 个设备播放` : ""),
      excerpt: String(ev.excerpt ?? ""),
      sessions,
    };
  });

  return NextResponse.json({
    ok: true,
    rangeDays,
    since: since.toISOString(),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      totalEvents: total,
      totalUsers: distinctUsers.length,
    },
    penaltyConfig: normalizePenaltyConfig(penaltyConfigRow?.valueJson ?? {}),
    penaltyRecords: (Array.isArray(penaltyRecordsRow?.valueJson) ? (penaltyRecordsRow?.valueJson as any[]) : [])
      .slice()
      .sort((a: any, b: any) => String(b?.disabledAt ?? "").localeCompare(String(a?.disabledAt ?? "")))
      .slice(0, 100),
    anomalies,
  });
}
