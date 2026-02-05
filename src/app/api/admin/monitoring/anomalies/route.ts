export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const serverId = (url.searchParams.get("serverId") ?? "").trim();
  const rangeDays = Math.max(1, Math.min(365, Number(url.searchParams.get("rangeDays") ?? "7") || 7));
  const q = (url.searchParams.get("q") ?? "").trim();

  const since = new Date(Date.now() - rangeDays * 24 * 3600 * 1000);

  const where: any = {
    type: "MULTI_DEVICE_CONCURRENCY",
    detectedAt: { gte: since },
    ...(serverId ? { embyServerId: serverId } : {}),
    ...(q ? { user: { username: { contains: q, mode: "insensitive" } } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.anomaly.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      take: 200,
      select: {
        id: true,
        detectedAt: true,
        embyServer: { select: { id: true, name: true } },
        user: { select: { id: true, username: true } },
        evidenceJson: true,
      },
    }),
    prisma.anomaly.count({ where }),
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
      sessions,
    };
  });

  return NextResponse.json({
    ok: true,
    rangeDays,
    since: since.toISOString(),
    summary: {
      totalEvents: total,
      totalUsers: distinctUsers.length,
    },
    anomalies,
  });
}
