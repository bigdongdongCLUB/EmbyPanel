export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchSessions } from "@/lib/emby-sessions";

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



type SessionStateRow = {
  embyServerId: string;
  sessionId: string;
  embyUserId: string | null;
  userName: string | null;
  mediaName: string;
  mediaKey: string;
  client: string;
  ip: string;
  startedAt: Date;
  lastSeenAt: Date;
  sourceJson?: any;
};

async function ensurePlaybackSessionStateTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PlaybackSessionState" (
        "id" TEXT PRIMARY KEY,
        "embyServerId" TEXT NOT NULL,
        "sessionId" TEXT NOT NULL,
        "embyUserId" TEXT,
        "userName" TEXT,
        "mediaName" TEXT NOT NULL,
        "mediaKey" TEXT NOT NULL,
        "client" TEXT,
        "ip" TEXT,
        "startedAt" TIMESTAMP(3) NOT NULL,
        "lastSeenAt" TIMESTAMP(3) NOT NULL,
        "sourceJson" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PlaybackSessionState_embyServerId_sessionId_key" ON "PlaybackSessionState"("embyServerId", "sessionId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PlaybackSessionState_embyServerId_lastSeenAt_idx" ON "PlaybackSessionState"("embyServerId", "lastSeenAt")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PlaybackSessionState_embyServerId_embyUserId_lastSeenAt_idx" ON "PlaybackSessionState"("embyServerId", "embyUserId", "lastSeenAt")`);
  } catch {
    // ignore when table creation unavailable
  }
}

async function loadPlaybackSessionStatesForUser(embyServerId: string, embyUserId: string | null, username: string) {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "embyServerId", "sessionId", "embyUserId", "userName", "mediaName", "mediaKey", "client", "ip", "startedAt", "lastSeenAt", "sourceJson" FROM "PlaybackSessionState" WHERE "embyServerId"=$1 AND (("embyUserId" IS NOT NULL AND "embyUserId"=$2) OR LOWER(COALESCE("userName", ''))=LOWER($3))`,
      embyServerId,
      embyUserId,
      username
    );
    return (rows || []).map((r) => ({
      embyServerId: String(r.embyServerId),
      sessionId: String(r.sessionId),
      embyUserId: r.embyUserId ? String(r.embyUserId) : null,
      userName: r.userName ? String(r.userName) : null,
      mediaName: String(r.mediaName || ""),
      mediaKey: String(r.mediaKey || ""),
      client: String(r.client || "-"),
      ip: normalizeIp(r.ip),
      startedAt: new Date(r.startedAt),
      lastSeenAt: new Date(r.lastSeenAt),
      sourceJson: r.sourceJson,
    })) as SessionStateRow[];
  } catch {
    return [] as SessionStateRow[];
  }
}

async function upsertPlaybackSessionState(row: SessionStateRow, keepStartedAt?: Date) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PlaybackSessionState" ("id", "embyServerId", "sessionId", "embyUserId", "userName", "mediaName", "mediaKey", "client", "ip", "startedAt", "lastSeenAt", "sourceJson", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$13) ON CONFLICT ("embyServerId", "sessionId") DO UPDATE SET "embyUserId"=EXCLUDED."embyUserId", "userName"=EXCLUDED."userName", "mediaName"=EXCLUDED."mediaName", "mediaKey"=EXCLUDED."mediaKey", "client"=EXCLUDED."client", "ip"=EXCLUDED."ip", "startedAt"=$14, "lastSeenAt"=EXCLUDED."lastSeenAt", "sourceJson"=EXCLUDED."sourceJson", "updatedAt"=EXCLUDED."updatedAt"`,
    `${row.embyServerId}:${row.sessionId}`,
    row.embyServerId,
    row.sessionId,
    row.embyUserId,
    row.userName,
    row.mediaName,
    row.mediaKey,
    row.client,
    row.ip,
    row.startedAt,
    row.lastSeenAt,
    JSON.stringify(row.sourceJson ?? null),
    new Date(),
    keepStartedAt ?? row.startedAt
  );
}

async function deletePlaybackSessionState(embyServerId: string, sessionId: string) {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "PlaybackSessionState" WHERE "embyServerId"=$1 AND "sessionId"=$2`, embyServerId, sessionId);
  } catch {
    // ignore
  }
}

async function createPlaybackStartEventFromSessionState(row: SessionStateRow, occurredAt: Date) {
  const minuteBucket = Math.floor(occurredAt.getTime() / 60000);
  const activityId = `session:${row.sessionId}:start:${row.mediaKey}:${minuteBucket}`;
  try {
    await prisma.playbackEvent.create({
      data: {
        embyServerId: row.embyServerId,
        activityId,
        embyUserId: row.embyUserId,
        userName: row.userName,
        eventType: "start",
        mediaName: row.mediaName,
        mediaKey: row.mediaKey,
        client: row.client,
        ip: row.ip,
        occurredAt,
        sourceJson: row.sourceJson,
      },
    });
    return true;
  } catch {
    return false;
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


function formatMediaNameFromSession(s: any) {
  const item = s?.NowPlayingItem ?? s?.nowPlayingItem ?? {};
  const seriesName = String(item?.SeriesName || item?.seriesName || "").trim();
  const itemName = String(item?.Name || item?.name || s?.nowPlaying || "").trim();
  const seasonNum = Number(item?.ParentIndexNumber ?? item?.parentIndexNumber);
  const episodeNum = Number(item?.IndexNumber ?? item?.indexNumber);

  if (seriesName && itemName && seriesName !== itemName) {
    const se: string[] = [];
    if (Number.isFinite(seasonNum) && seasonNum > 0) se.push(`S${seasonNum}`);
    if (Number.isFinite(episodeNum) && episodeNum > 0) se.push(`Ep${episodeNum}`);
    const sePart = se.length ? ` - ${se.join(", ")}` : "";
    return `${seriesName}${sePart} - ${itemName}`;
  }

  return itemName || seriesName || "";
}

function formatMediaNameFromSource(mediaName: string, sourceJson?: any) {
  const fromSession = formatMediaNameFromSession(sourceJson);
  if (fromSession) return fromSession;
  return String(mediaName || "").trim();
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
      subscriptions: {
        where: { status: "ACTIVE", endAt: { gt: new Date() } },
        orderBy: { endAt: "desc" },
        take: 1,
        select: {
          servers: {
            select: {
              embyServerId: true,
              embyServer: { select: { id: true, name: true, baseUrl: true, enabled: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true } },
            },
          },
        },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  await ensurePlaybackEventTable();
  await ensurePlaybackSessionStateTable();

  const serverCandidates = new Map<string, { embyServerId: string; embyUserId: string | null; embyServer: any }>();
  for (const link of user.embyLinks) {
    if (!link.embyServer?.enabled) continue;
    serverCandidates.set(link.embyServerId, { embyServerId: link.embyServerId, embyUserId: link.embyUserId, embyServer: link.embyServer });
  }
  for (const ss of user.subscriptions?.[0]?.servers ?? []) {
    if (!ss.embyServer?.enabled) continue;
    if (!serverCandidates.has(ss.embyServerId)) {
      serverCandidates.set(ss.embyServerId, { embyServerId: ss.embyServerId, embyUserId: null, embyServer: ss.embyServer });
    }
  }

  const rows: OutputRow[] = [];

  for (const srv of serverCandidates.values()) {
    if (!srv.embyServer?.enabled) continue;

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
      const dbWhere: any = {
        embyServerId: srv.embyServerId,
        occurredAt: { gte: since },
        OR: [{ userName: { equals: user.username, mode: "insensitive" } }],
      };
      if (srv.embyUserId) dbWhere.OR.unshift({ embyUserId: srv.embyUserId });

      const events = await prisma.playbackEvent.findMany({
        where: dbWhere,
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
        const mediaName = formatMediaNameFromSource(String(ev.mediaName || ""), ev.sourceJson).trim();
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

    const apiKey = getEmbyApiKeyForServer(srv.embyServer as any);

    // 2) 基于实时 Sessions 的状态机：先缓存详细信息，结束后结算 stop 事件
    if (apiKey) {
      try {
        const ses = await embyFetchSessions(srv.embyServer.baseUrl, apiKey);
        if (ses.ok) {
          const now = new Date();
          const uname = user.username.toLowerCase();
          const existingStates = await loadPlaybackSessionStatesForUser(srv.embyServerId, srv.embyUserId, user.username);
          const existingBySession = new Map(existingStates.map((x) => [x.sessionId, x]));
          const activeSessionIds = new Set<string>();

          for (const s of ses.sessions ?? []) {
            const sameUser = srv.embyUserId
              ? String(s?.UserId || "") === String(srv.embyUserId)
              : String(s?.UserName || "").toLowerCase() === uname;
            if (!sameUser) continue;

            const sessionId = String(s?.Id || "").trim();
            if (!sessionId) continue;

            const mediaName = formatMediaNameFromSession(s).trim();
            if (!mediaName) continue;

            activeSessionIds.add(sessionId);

            const stateRow: SessionStateRow = {
              embyServerId: srv.embyServerId,
              sessionId,
              embyUserId: String(s?.UserId || "").trim() || srv.embyUserId || null,
              userName: String(s?.UserName || "").trim() || user.username,
              mediaName,
              mediaKey: normalizeMediaKey(mediaName),
              client: toDetailedClient("-", undefined, {
                device: s?.DeviceName,
                client: s?.Client,
                app: s?.ApplicationVersion,
              }),
              ip: normalizeIp(s?.RemoteEndPoint || "-"),
              startedAt: now,
              lastSeenAt: now,
              sourceJson: s,
            };

            const prev = existingBySession.get(sessionId);
            if (!prev) {
              await upsertPlaybackSessionState(stateRow);
              await createPlaybackStartEventFromSessionState(stateRow, now);
            } else {
              const changedMedia = normalizeMediaKey(prev.mediaKey || prev.mediaName) !== stateRow.mediaKey;
              if (changedMedia) {
                await upsertPlaybackSessionState(stateRow, now);
                await createPlaybackStartEventFromSessionState(stateRow, now);
              } else {
                await upsertPlaybackSessionState(stateRow, prev.startedAt);
              }
            }

            // 实时展示
            rawEvents.push({
              eventType: s?.PlayState?.IsPaused ? "live_session_paused" : "live_session_playing",
              mediaName,
              mediaKey: stateRow.mediaKey,
              client: stateRow.client,
              ip: stateRow.ip,
              occurredAt: now,
              sourceJson: s,
            });
          }

          // 对于已不在 Sessions 的缓存会话，仅清理缓存（记录以开始播放时为准）
          for (const prev of existingStates) {
            if (activeSessionIds.has(prev.sessionId)) continue;
            await deletePlaybackSessionState(prev.embyServerId, prev.sessionId);
          }
        }
      } catch {
        // ignore live session source failures
      }
    }

    // 4) 最近会话快照（live sessions 失败时的兜底）
    try {
      const latestSnapshot = await prisma.sessionSnapshot.findFirst({
        where: { embyServerId: srv.embyServerId, capturedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
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
        ? `A:${srv.embyServerId}:${ev.activityId}`
        : `F:${srv.embyServerId}:${ev.eventType}:${ev.mediaKey}:${Math.floor(ev.occurredAt.getTime() / 1000)}`;
      const prev = uniqueEvents.get(fingerprint);
      if (!prev || ev.occurredAt.getTime() > prev.occurredAt.getTime()) uniqueEvents.set(fingerprint, ev);
    }

    // 5) 展示去重：同媒体10分钟窗口只保留一条；若有 stop 则优先 stop
    const displayMap = new Map<string, OutputRow & { __eventType: string; __ts: number }>();
    const ordered = Array.from(uniqueEvents.values()).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    for (const ev of ordered) {
      const mediaName = formatMediaNameFromSource(String(ev.mediaName || ""), ev.sourceJson).trim();
      if (!mediaName) continue;
      const mediaKey = normalizeMediaKey(ev.mediaKey || mediaName);
      const ts = ev.occurredAt.getTime();
      const bucket = Math.floor(ts / (10 * 60 * 1000));
      const key = `${srv.embyServerId}:${mediaKey}:${bucket}`;

      const nextRow: OutputRow & { __eventType: string; __ts: number } = {
        serverId: srv.embyServerId,
        serverName: srv.embyServer.name,
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

      const nextRichness = (nextRow.ip !== "-" ? 1 : 0) + (!isGenericClient(nextRow.client) ? 1 : 0);
      const prevRichness = (prev.ip !== "-" ? 1 : 0) + (!isGenericClient(prev.client) ? 1 : 0);
      const preferNext = nextRow.__ts > prev.__ts || (nextRow.__ts === prev.__ts && nextRichness > prevRichness);
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

  const cleanedRows = rows;

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
