export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchSessions } from "@/lib/emby-sessions";

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
  const m = s.match(/^(\d+\.\d+\.\d+\.\d+)(?::\d+)?$/);
  if (m) return m[1];
  return s;
}

function toDetailedClientFromSession(x: any) {
  const device = String(x?.DeviceName || "").trim();
  const client = String(x?.Client || "").trim();
  const app = String(x?.ApplicationVersion || "").trim();
  if (device && client && app) return `${device} (${client} ${app})`;
  if (device && client) return `${device} (${client})`;
  if (device) return device;
  if (client && app) return `${client} ${app}`;
  if (client) return client;
  return "-";
}

function formatMediaNameFromSession(x: any) {
  const item = x?.NowPlayingItem ?? {};
  const seriesName = String(item?.SeriesName || "").trim();
  const itemName = String(item?.Name || "").trim();
  const seasonNum = Number(item?.ParentIndexNumber);
  const episodeNum = Number(item?.IndexNumber);

  if (seriesName && itemName && seriesName !== itemName) {
    const se: string[] = [];
    if (Number.isFinite(seasonNum) && seasonNum > 0) se.push(`S${seasonNum}`);
    if (Number.isFinite(episodeNum) && episodeNum > 0) se.push(`Ep${episodeNum}`);
    const sePart = se.length ? ` - ${se.join(", ")}` : "";
    return `${seriesName}${sePart} - ${itemName}`;
  }

  return itemName || seriesName || "";
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
}

async function getServerSessionStates(embyServerId: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "embyServerId", "sessionId", "embyUserId", "userName", "mediaName", "mediaKey", "client", "ip", "startedAt", "lastSeenAt", "sourceJson" FROM "PlaybackSessionState" WHERE "embyServerId"=$1`,
    embyServerId
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
}

async function insertSessionState(row: SessionStateRow) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PlaybackSessionState" ("id", "embyServerId", "sessionId", "embyUserId", "userName", "mediaName", "mediaKey", "client", "ip", "startedAt", "lastSeenAt", "sourceJson", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$13) ON CONFLICT ("embyServerId", "sessionId") DO NOTHING`,
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
    new Date()
  );
}

async function updateSessionState(row: SessionStateRow, keepStartedAt?: Date) {
  await prisma.$executeRawUnsafe(
    `UPDATE "PlaybackSessionState" SET "embyUserId"=$3, "userName"=$4, "mediaName"=$5, "mediaKey"=$6, "client"=$7, "ip"=$8, "startedAt"=$9, "lastSeenAt"=$10, "sourceJson"=$11::jsonb, "updatedAt"=$12 WHERE "embyServerId"=$1 AND "sessionId"=$2`,
    row.embyServerId,
    row.sessionId,
    row.embyUserId,
    row.userName,
    row.mediaName,
    row.mediaKey,
    row.client,
    row.ip,
    keepStartedAt ?? row.startedAt,
    row.lastSeenAt,
    JSON.stringify(row.sourceJson ?? null),
    new Date()
  );
}

async function deleteSessionState(embyServerId: string, sessionId: string) {
  await prisma.$executeRawUnsafe(`DELETE FROM "PlaybackSessionState" WHERE "embyServerId"=$1 AND "sessionId"=$2`, embyServerId, sessionId);
}

async function createPlaybackStartEvent(row: SessionStateRow, occurredAt: Date) {
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
    return 1;
  } catch {
    return 0;
  }
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
  const job = await prisma.jobRun.create({ data: { jobName: "playback-collect", startedAt } });

  try {
    await ensurePlaybackSessionStateTable();

    const servers = await prisma.embyServer.findMany({
      where: { enabled: true },
      select: { id: true, name: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
      orderBy: { createdAt: "asc" },
    });

    const linkByServerAndName = new Map<string, string>();
    const links = await prisma.embyUserLink.findMany({ select: { embyServerId: true, embyUserId: true, user: { select: { username: true } } } });
    for (const l of links as any[]) {
      linkByServerAndName.set(`${l.embyServerId}:${String(l.user?.username || "").toLowerCase()}`, l.embyUserId);
    }

    let collected = 0;
    let snapshots = 0;

    for (const s of servers) {
      const apiKey = getEmbyApiKeyForServer(s as any);
      if (!apiKey) continue;

      const ses = await embyFetchSessions(s.baseUrl, apiKey).catch(() => null);
      if (!ses?.ok) continue;

      const now = new Date();
      const sessions = ses.sessions ?? [];

      // 1) 原样快照落库，供辅助排查
      try {
        await prisma.sessionSnapshot.create({
          data: {
            embyServerId: s.id,
            capturedAt: now,
            sessionCount: sessions.length,
            rawJson: sessions.map((x: any) => ({
              id: x?.Id ?? null,
              userId: x?.UserId ?? null,
              userName: x?.UserName ?? null,
              client: x?.Client ?? null,
              app: x?.ApplicationVersion ?? null,
              device: x?.DeviceName ?? null,
              paused: !!x?.PlayState?.IsPaused,
              ip: x?.RemoteEndPoint ?? null,
              nowPlaying: x?.NowPlayingItem?.Name ?? x?.NowPlayingItem?.SeriesName ?? null,
              source: "sessions",
            })),
          },
        });
        snapshots += 1;
      } catch {}

      // 2) 读取当前缓存状态
      const existing = await getServerSessionStates(s.id);
      const existingBySession = new Map(existing.map((x) => [x.sessionId, x]));

      // 3) 把当前正在播放写入状态缓存；新会话写 start；媒体切换先 stop 再 start
      const activeSessionIds = new Set<string>();
      for (const x of sessions) {
        const sessionId = String(x?.Id || "").trim();
        if (!sessionId) continue;

        const mediaName = formatMediaNameFromSession(x).trim();
        if (!mediaName) continue;

        const userName = String(x?.UserName || "").trim() || null;
        const embyUserId = String(x?.UserId || "").trim() || (userName ? linkByServerAndName.get(`${s.id}:${userName.toLowerCase()}`) || null : null);
        if (!embyUserId && !userName) continue;

        activeSessionIds.add(sessionId);

        const row: SessionStateRow = {
          embyServerId: s.id,
          sessionId,
          embyUserId,
          userName,
          mediaName,
          mediaKey: normalizeMediaKey(mediaName),
          client: toDetailedClientFromSession(x),
          ip: normalizeIp(x?.RemoteEndPoint),
          startedAt: now,
          lastSeenAt: now,
          sourceJson: x,
        };

        const prev = existingBySession.get(sessionId);
        if (!prev) {
          await insertSessionState(row);
          collected += await createPlaybackStartEvent(row, now);
          continue;
        }

        const changedMedia = normalizeMediaKey(prev.mediaKey || prev.mediaName) !== row.mediaKey;
        if (changedMedia) {
          await updateSessionState(row, now);
          collected += await createPlaybackStartEvent(row, now);
          continue;
        }

        // 同一媒体持续播放：只更新详细信息和 lastSeenAt，startedAt 保持首次时间
        await updateSessionState(row, prev.startedAt);
      }

      // 4) 不再出现在 /Sessions 的会话直接清理缓存（无需 stop 结算）
      for (const prev of existing) {
        if (activeSessionIds.has(prev.sessionId)) continue;
        await deleteSessionState(prev.embyServerId, prev.sessionId);
      }
    }

    const finishedAt = new Date();
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: true, message: JSON.stringify({ collected, snapshots, source: "sessions" }) } });
    return NextResponse.json({ ok: true, collected, snapshots, source: "sessions", jobRunId: job.id });
  } catch (e: any) {
    const finishedAt = new Date();
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: false, message: String(e?.message ?? e) } });
    return NextResponse.json({ error: "job_failed", message: String(e?.message ?? e), jobRunId: job.id }, { status: 500 });
  }
}
