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
  const app = String(
    snapshot?.client || sourceJson?.ClientName || sourceJson?.clientName || sourceJson?.Client || sourceJson?.client || snapshot?.app || sourceJson?.Application || ""
  ).trim();

  if (device && app) return `${device} (${app})`;
  if (device) return device;
  if (app) return app;
  return baseClient || "-";
}

function isGenericClient(v: string) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return true;
  return /^(apple[_ ]?tv|iphone|ipad|android|mac|windows|web|safari|chrome|edge|-)$/.test(s);
}

type OutputRow = {
  serverId: string;
  serverName: string;
  mediaName: string;
  mediaKey: string;
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
    activityId: pickString(entry, ["Id", "id"]) || null,
    eventType: isStart ? "start" : "stop",
    userName: userName || null,
    mediaName,
    mediaKey: normalizeMediaKey(mediaName),
    client,
    ip: normalizeIp(pickString(entry, ["RemoteEndPoint", "remoteEndPoint", "RemoteAddress", "remoteAddress", "IpAddress", "ipAddress", "IPAddress"])),
    occurredAt,
    sourceJson: entry,
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

    const rawEvents: Array<{
      activityId?: string | null;
      eventType: string;
      mediaName: string;
      mediaKey: string;
      client: string;
      ip: string;
      occurredAt: Date;
      sourceJson?: any;
    }> = [];

    // 1) 历史采集库（快速）
    try {
      const events = await prisma.playbackEvent.findMany({
        where: {
          embyServerId: link.embyServerId,
          occurredAt: { gte: since },
          OR: [{ embyUserId: link.embyUserId }, { userName: { equals: user.username, mode: "insensitive" } }],
        },
        orderBy: { occurredAt: "desc" },
        take: 2000,
        select: {
          activityId: true,
          eventType: true,
          mediaName: true,
          mediaKey: true,
          client: true,
          ip: true,
          sourceJson: true,
          occurredAt: true,
        },
      });

      for (const ev of events) {
        const mediaName = String(ev.mediaName || "").trim();
        if (!mediaName) continue;
        rawEvents.push({
          activityId: ev.activityId || null,
          eventType: String(ev.eventType || "play"),
          mediaName,
          mediaKey: normalizeMediaKey(ev.mediaKey || mediaName),
          client: toDetailedClient(String(ev.client || "-"), ev.sourceJson),
          ip: normalizeIp(ev.ip),
          occurredAt: ev.occurredAt,
          sourceJson: ev.sourceJson,
        });
      }
    } catch {
      // ignore and fallback to live sources
    }

    // 2) 实时 Activity（补齐刚播放但采集任务未落库的窗口）
    const apiKey = getEmbyApiKeyForServer(link.embyServer as any);
    if (apiKey) {
      const live = await fetchActivityEntries(link.embyServer.baseUrl, apiKey, 400);
      if (live.length) {
        const parsed = live
          .map((x) => parseActivityEntryToPlayback(x, user.username))
          .filter(Boolean) as Array<{
          activityId?: string | null;
          eventType: "start" | "stop";
          mediaName: string;
          mediaKey: string;
          client: string;
          ip: string;
          occurredAt: Date;
          sourceJson?: any;
        }>;

        for (const ev of parsed) {
          if (ev.occurredAt < since) continue;
          rawEvents.push({
            activityId: ev.activityId || null,
            eventType: ev.eventType,
            mediaName: ev.mediaName,
            mediaKey: normalizeMediaKey(ev.mediaKey || ev.mediaName),
            client: toDetailedClient(ev.client || "-", ev.sourceJson),
            ip: normalizeIp(ev.ip),
            occurredAt: ev.occurredAt,
            sourceJson: ev.sourceJson,
          });
        }
      }
    }

    // 3) 最近会话快照（进一步补齐实时正在播放）
    try {
      const latestSnapshot = await prisma.sessionSnapshot.findFirst({
        where: { embyServerId: link.embyServerId, capturedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
        select: { capturedAt: true, rawJson: true },
        orderBy: { capturedAt: "desc" },
      });

      const sessions = Array.isArray(latestSnapshot?.rawJson) ? (latestSnapshot!.rawJson as any[]) : [];
      const uname = user.username.toLowerCase();
      for (const s of sessions) {
        if (String(s?.userName ?? "").toLowerCase() !== uname) continue;
        const mediaName = String(s?.nowPlaying ?? "").trim();
        if (!mediaName) continue;
        rawEvents.push({
          eventType: s?.paused ? "snapshot_paused" : "snapshot_playing",
          mediaName,
          mediaKey: normalizeMediaKey(mediaName),
          client: toDetailedClient("-", undefined, s),
          ip: normalizeIp(s?.ip),
          occurredAt: latestSnapshot!.capturedAt,
          sourceJson: s,
        });
      }
    } catch {
      // ignore snapshot enrichment source failures
    }

    if (!rawEvents.length) continue;

    // 4) 原始事件去重：优先 activityId，其次指纹
    const uniqueEvents = new Map<string, (typeof rawEvents)[number]>();
    for (const ev of rawEvents) {
      const fingerprint = ev.activityId
        ? `A:${link.embyServerId}:${ev.activityId}`
        : `F:${link.embyServerId}:${ev.eventType}:${ev.mediaKey}:${Math.floor(ev.occurredAt.getTime() / 1000)}`;
      const prev = uniqueEvents.get(fingerprint);
      if (!prev || ev.occurredAt.getTime() > prev.occurredAt.getTime()) uniqueEvents.set(fingerprint, ev);
    }

    // 5) 展示去重：同媒体10分钟窗口只保留一条；若有 stop 则优先 stop
    const displayMap = new Map<string, OutputRow & { __eventType: string; __ts: number }>();
    const ordered = Array.from(uniqueEvents.values()).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    for (const ev of ordered) {
      const mediaName = String(ev.mediaName || "").trim();
      if (!mediaName) continue;
      const mediaKey = normalizeMediaKey(ev.mediaKey || mediaName);
      const ts = ev.occurredAt.getTime();
      const bucket = Math.floor(ts / (10 * 60 * 1000));
      const key = `${link.embyServerId}:${mediaKey}:${bucket}`;

      const nextRow: OutputRow & { __eventType: string; __ts: number } = {
        serverId: link.embyServerId,
        serverName: link.embyServer.name,
        mediaName,
        mediaKey,
        client: toDetailedClient(ev.client || "-", ev.sourceJson),
        ip: normalizeIp(ev.ip),
        lastPlayedAt: ev.occurredAt.toISOString(),
        __eventType: ev.eventType,
        __ts: ts,
      };

      const prev = displayMap.get(key);
      if (!prev) {
        displayMap.set(key, nextRow);
        continue;
      }

      const preferNext =
        (nextRow.__eventType === "stop" && prev.__eventType !== "stop") ||
        (nextRow.__eventType === prev.__eventType && nextRow.__ts > prev.__ts);
      if (preferNext) displayMap.set(key, nextRow);
    }

    for (const r of displayMap.values()) {
      rows.push({
        serverId: r.serverId,
        serverName: r.serverName,
        mediaName: r.mediaName,
        mediaKey: r.mediaKey,
        client: r.client,
        ip: r.ip,
        lastPlayedAt: r.lastPlayedAt,
      });
    }
  }

  // secondary enrichment by session snapshots for missing ip/client
  const missing = rows.filter((r) => r.ip === "-" || isGenericClient(r.client));
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
        const uname = user.username.toLowerCase();
        const sameUser = list.filter((x) => String(x?.userName ?? "").toLowerCase() === uname);
        if (!sameUser.length) continue;

        const sameMedia = sameUser.filter((x) => normalizeMediaKey(String(x?.nowPlaying ?? "")) === normalizeMediaKey(r.mediaName));
        const preferred = sameMedia.find((x) => !x?.paused) || sameMedia[0] || sameUser.find((x) => !x?.paused) || sameUser[0];
        if (!preferred) continue;

        const detailed = toDetailedClient(r.client, undefined, preferred);
        if (isGenericClient(r.client) && detailed) r.client = detailed;
        if (r.ip === "-") r.ip = normalizeIp(preferred.ip || "-");
        break;
      }
    }
  }

  const cleanedRows = rows.filter((r) => {
    // drop very low-quality samples: both ip missing and generic client
    if (r.ip !== "-") return true;
    return !isGenericClient(r.client);
  });

  cleanedRows.sort((a, b) => new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime());

  const watchedItemCount = new Set(cleanedRows.map((r) => r.mediaKey || normalizeMediaKey(r.mediaName))).size;

  return NextResponse.json({
    ok: true,
    rangeDays,
    summary: {
      watchedItemCount,
      totalRecords: cleanedRows.length,
    },
    records: cleanedRows,
  });
}
