export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { normalizeBaseUrl } from "@/lib/emby";

async function ensurePlaybackEventTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PlaybackEvent" (
        "id" TEXT PRIMARY KEY,
        "embyServerId" TEXT NOT NULL,
        "activityId" TEXT,
        "embyUserId" TEXT,
        "userName" TEXT,
        "eventType" TEXT NOT NULL,
        "mediaName" TEXT NOT NULL,
        "mediaKey" TEXT NOT NULL,
        "client" TEXT,
        "ip" TEXT,
        "occurredAt" TIMESTAMP(3) NOT NULL,
        "sourceJson" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PlaybackEvent_embyServerId_activityId_key" ON "PlaybackEvent"("embyServerId", "activityId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PlaybackEvent_embyServerId_embyUserId_occurredAt_idx" ON "PlaybackEvent"("embyServerId", "embyUserId", "occurredAt")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PlaybackEvent_embyServerId_userName_occurredAt_idx" ON "PlaybackEvent"("embyServerId", "userName", "occurredAt")`);
  } catch {
    // ignore; fallback in query stage
  }
}

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

function toDetailedClient(baseClient: string, sourceJson?: any, snapshot?: any) {
  const device = String(snapshot?.device || sourceJson?.DeviceName || sourceJson?.deviceName || "").trim();
  const app = String(snapshot?.client || sourceJson?.ClientName || sourceJson?.clientName || sourceJson?.Client || sourceJson?.client || "").trim();

  if (device && app) return `${device} (${app})`;
  if (device) return device;
  if (app) return app;
  return baseClient || "-";
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

function pickString(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function pickDate(obj: any) {
  const raw = pickString(obj, ["DateCreated", "dateCreated", "Date", "date", "Time", "time"]);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

async function fetchActivityEntries(baseUrl: string, apiKey: string, limit = 1200) {
  const base = normalizeBaseUrl(baseUrl);
  const urls = [
    `${base}/System/ActivityLog/Entries?api_key=${encodeURIComponent(apiKey)}&Limit=${limit}`,
    `${base}/System/ActivityLog/Entries?api_key=${encodeURIComponent(apiKey)}&StartIndex=0&Limit=${limit}`,
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      const rows = Array.isArray(json) ? json : json?.Items || json?.items || json?.Rows || json?.results || [];
      if (Array.isArray(rows) && rows.length) return rows;
    } catch {}
  }
  return [] as any[];
}

function parseActivityEntryToPlayback(entry: any, username: string) {
  const text = [pickString(entry, ["Overview", "overview"]), pickString(entry, ["Name", "name"]), pickString(entry, ["ShortOverview", "shortOverview"])]
    .filter(Boolean)
    .join(" ");
  if (!text) return null;
  if (!text.toLowerCase().includes(String(username).toLowerCase())) return null;

  const isStart = /(开始播放|start\s*playing|playing)/i.test(text) && !/(已停止播放|stopped|stop\s*playing)/i.test(text);
  const isStop = /(已停止播放|stopped|stop\s*playing)/i.test(text);
  if (!isStart && !isStop) return null;

  let userName = "";
  let mediaName = "";
  let client = "-";

  let m = text.match(/^\s*(.+?)\s*在\s*(.+?)\s*上开始播放\s*(.+)$/);
  if (m) {
    userName = (m[1] || "").trim();
    client = (m[2] || "").trim() || "-";
    mediaName = (m[3] || "").trim();
  }
  if (!mediaName) {
    m = text.match(/^\s*(.+?)\s*上\s*(.+?)\s*已停止播放\s*(.+)$/);
    if (m) {
      client = (m[1] || "").trim() || client;
      userName = (m[2] || "").trim() || userName;
      mediaName = (m[3] || "").trim();
    }
  }
  if (!mediaName) {
    m = text.match(/(?:开始播放|已停止播放|start\s*playing|stopped)\s*(.+)$/i);
    if (m) mediaName = (m[1] || "").trim();
  }
  if (!userName) {
    m = text.match(/^\s*(.+?)\s*(?:在|已)/);
    if (m) userName = (m[1] || "").trim();
  }

  const occurredAt = pickDate(entry);
  if (!occurredAt || !mediaName) return null;

  return {
    eventType: isStart ? "start" : "stop",
    userName: userName || null,
    mediaName,
    mediaKey: normalizeMediaKey(mediaName),
    client,
    ip: normalizeIp(pickString(entry, ["RemoteEndPoint", "remoteEndPoint", "RemoteAddress", "remoteAddress", "IpAddress", "ipAddress", "IPAddress"])),
    occurredAt,
  };
}

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
          embyServer: { select: { id: true, name: true, baseUrl: true, enabled: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true } },
        },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  await ensurePlaybackEventTable();

  const rows: OutputRow[] = [];

  for (const link of user.embyLinks) {
    if (!link.embyServer?.enabled) continue;

    let events: Array<{ eventType: string; mediaName: string; mediaKey: string; client: string | null; ip: string | null; sourceJson?: any; occurredAt: Date }> = [];
    try {
      events = await prisma.playbackEvent.findMany({
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
          sourceJson: true,
          occurredAt: true,
        },
      });
    } catch {
      events = [];
    }

    const starts = new Map<string, Date[]>();
    let pushedFromDb = 0;

    for (const ev of events) {
      const mediaKey = normalizeMediaKey(ev.mediaKey || ev.mediaName);
      const mediaName = String(ev.mediaName || "未知媒体");
      const client = toDetailedClient(String(ev.client || "-"), ev.sourceJson);
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
      pushedFromDb += 1;
    }

    // live fallback: when collector has no data yet, read Activity directly
    if (pushedFromDb === 0) {
      const apiKey = getEmbyApiKeyForServer(link.embyServer as any);
      if (apiKey) {
        const live = await fetchActivityEntries(link.embyServer.baseUrl, apiKey, 1000);
        if (live.length) {
          const parsed = live
            .map((x) => parseActivityEntryToPlayback(x, user.username))
            .filter(Boolean) as Array<{ eventType: "start" | "stop"; mediaName: string; mediaKey: string; client: string; ip: string; occurredAt: Date }>;

          parsed.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
          const liveStarts = new Map<string, Date[]>();
          for (const ev of parsed) {
            if (ev.occurredAt < since) continue;
            const k = `${ev.mediaKey}|${ev.client}|${ev.ip}`;
            if (ev.eventType === "start") {
              const arr = liveStarts.get(k) ?? [];
              arr.push(ev.occurredAt);
              liveStarts.set(k, arr);
              continue;
            }

            const arr = liveStarts.get(k) ?? [];
            let durationSeconds = 0;
            if (arr.length) {
              const st = arr.pop()!;
              liveStarts.set(k, arr);
              durationSeconds = Math.max(0, Math.round((ev.occurredAt.getTime() - st.getTime()) / 1000));
              if (durationSeconds > 24 * 3600) durationSeconds = 0;
            }

            rows.push({
              serverId: link.embyServerId,
              serverName: link.embyServer.name,
              mediaName: ev.mediaName,
              mediaKey: ev.mediaKey,
              durationSeconds,
              client: ev.client || "-",
              ip: ev.ip || "-",
              lastPlayedAt: ev.occurredAt.toISOString(),
            });
          }
        }
      }
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
        r.client = toDetailedClient(r.client, undefined, m);
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
