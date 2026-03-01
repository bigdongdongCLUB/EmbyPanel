export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function normalizeMediaKey(v: string) {
  return String(v || "")
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[\[\]【】()（）]/g, "")
    .replace(/[，,。.!！?？:：；;]+/g, "")
    .replace(/-s\d+[,，]?e?p?\d+.*$/i, "")
    .trim();
}

function normalizeIp(v?: string | null) {
  const s = String(v || "").trim();
  if (!s) return "-";
  // remove port from ipv4 style ip:port
  const m = s.match(/^(\d+\.\d+\.\d+\.\d+)(?::\d+)?$/);
  if (m) return m[1];
  return s;
}

type OutputRow = {
  serverId: string;
  serverName: string;
  mediaName: string;
  mediaKey: string;
  durationSeconds: number;
  client: string;
  ip: string;
  lastPlayedAt: string;
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const rangeDays = Number(url.searchParams.get("rangeDays") ?? "30");
  if (![7, 30, 90].includes(rangeDays)) return NextResponse.json({ error: "invalid_range" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      embyLinks: {
        where: { disabled: false },
        select: {
          embyServerId: true,
          embyUserId: true,
          embyServer: { select: { id: true, name: true, enabled: true } },
        },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

  const rows: OutputRow[] = [];

  for (const link of user.embyLinks) {
    if (!link.embyServer?.enabled) continue;

    const events = await prisma.playbackEvent.findMany({
      where: {
        embyServerId: link.embyServerId,
        occurredAt: { gte: since },
        OR: [{ embyUserId: link.embyUserId }, { userName: { equals: user.username, mode: "insensitive" } }],
      },
      orderBy: { occurredAt: "asc" },
      select: {
        eventType: true,
        mediaName: true,
        mediaKey: true,
        client: true,
        ip: true,
        occurredAt: true,
      },
    });

    if (!events.length) continue;

    const starts = new Map<string, Date[]>();

    for (const ev of events) {
      const mediaKey = normalizeMediaKey(ev.mediaKey || ev.mediaName);
      const mediaName = String(ev.mediaName || "未知媒体");
      const client = String(ev.client || "-");
      const ip = normalizeIp(ev.ip);
      const k = `${mediaKey}|${client}|${ip}`;

      if (ev.eventType === "start") {
        const arr = starts.get(k) ?? [];
        arr.push(ev.occurredAt);
        starts.set(k, arr);
        continue;
      }

      if (ev.eventType !== "stop") continue;

      let durationSeconds = 0;
      const arr = starts.get(k) ?? [];
      if (arr.length) {
        const st = arr.pop()!;
        starts.set(k, arr);
        durationSeconds = Math.max(0, Math.round((ev.occurredAt.getTime() - st.getTime()) / 1000));
        if (durationSeconds > 24 * 3600) durationSeconds = 0;
      }

      rows.push({
        serverId: link.embyServerId,
        serverName: link.embyServer.name,
        mediaName,
        mediaKey,
        durationSeconds,
        client,
        ip,
        lastPlayedAt: ev.occurredAt.toISOString(),
      });
    }
  }

  // secondary enrichment by session snapshots for missing ip/client
  const missing = rows.filter((r) => r.ip === "-" || r.client === "-");
  if (missing.length) {
    const snapshots = await prisma.sessionSnapshot.findMany({
      where: { capturedAt: { gte: since }, embyServerId: { in: Array.from(new Set(missing.map((x) => x.serverId))) } },
      select: { embyServerId: true, capturedAt: true, rawJson: true },
      orderBy: { capturedAt: "desc" },
      take: 1000,
    });

    for (const r of missing) {
      const rt = new Date(r.lastPlayedAt).getTime();
      for (const s of snapshots) {
        if (s.embyServerId !== r.serverId) continue;
        const st = s.capturedAt.getTime();
        if (Math.abs(st - rt) > 20 * 60 * 1000) continue;
        const list = Array.isArray(s.rawJson) ? (s.rawJson as any[]) : [];
        const m = list.find((x) => normalizeMediaKey(String(x?.nowPlaying ?? "")) === normalizeMediaKey(r.mediaName) && String(x?.userName ?? "").toLowerCase() === user.username.toLowerCase());
        if (!m) continue;
        if (r.client === "-") r.client = String(m.client || m.device || "-");
        if (r.ip === "-") r.ip = normalizeIp(m.ip || "-");
        break;
      }
    }
  }

  rows.sort((a, b) => new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime());

  const totalDurationSeconds = rows.reduce((sum, r) => sum + (Number.isFinite(r.durationSeconds) ? r.durationSeconds : 0), 0);
  const watchedItemCount = new Set(rows.map((r) => r.mediaKey || normalizeMediaKey(r.mediaName))).size;

  return NextResponse.json({
    ok: true,
    rangeDays,
    summary: {
      totalDurationSeconds,
      watchedItemCount,
      totalRecords: rows.length,
    },
    records: rows,
  });
}
