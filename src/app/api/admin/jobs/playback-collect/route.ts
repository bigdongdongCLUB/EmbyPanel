export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { normalizeBaseUrl } from "@/lib/emby";
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

function parseActivity(entry: any) {
  const text = [pickString(entry, ["Overview", "overview"]), pickString(entry, ["Name", "name"]), pickString(entry, ["ShortOverview", "shortOverview"])]
    .filter(Boolean)
    .join(" ");
  if (!text) return null;

  const isStart = /(开始播放|start\s*playing|playing)/i.test(text) && !/(已停止播放|stop\s*playing|stopped)/i.test(text);
  const isStop = /(已停止播放|stop\s*playing|stopped)/i.test(text);
  const isLogin = /(被验证|登录验证|authenticated|logged in)/i.test(text);
  if (!isStart && !isStop && !isLogin) return null;

  const occurredAt = pickDate(entry);
  if (!occurredAt) return null;

  let userName = "";
  let mediaName = "";
  let client = "";

  // zh-CN patterns
  let m = text.match(/^\s*(.+?)\s*在\s*(.+?)\s*上开始播放\s*(.+)$/);
  if (m) {
    userName = (m[1] || "").trim();
    client = (m[2] || "").trim();
    mediaName = (m[3] || "").trim();
  }

  if (!userName || !mediaName) {
    m = text.match(/^\s*(.+?)\s*上\s*(.+?)\s*已停止播放\s*(.+)$/);
    if (m) {
      client = (m[1] || "").trim() || client;
      userName = (m[2] || "").trim() || userName;
      mediaName = (m[3] || "").trim() || mediaName;
    }
  }

  if (!userName) {
    m = text.match(/^\s*(.+?)\s*(?:在|已)/);
    if (m) userName = (m[1] || "").trim();
  }

  const eventType = isStart ? "start" : isStop ? "stop" : "login";
  mediaName = mediaName.replace(/^[:：\-\s]+/, "").trim();

  return {
    activityId: pickString(entry, ["Id", "id"]) || null,
    eventType,
    userName: userName || null,
    mediaName: mediaName || (eventType === "login" ? "登录" : null),
    mediaKey: mediaName ? normalizeMediaKey(mediaName) : "",
    client: client || null,
    ip: pickString(entry, ["RemoteEndPoint", "remoteEndPoint", "RemoteAddress", "remoteAddress", "IpAddress", "ipAddress", "IPAddress"]) || null,
    occurredAt,
    sourceJson: entry,
  };
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
    const servers = await prisma.embyServer.findMany({
      where: { enabled: true },
      select: { id: true, name: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
      orderBy: { createdAt: "asc" },
    });

    const linkByServerAndName = new Map<string, string>();
    const linkByServerAndEmbyUserId = new Map<string, string>();
    const links = await prisma.embyUserLink.findMany({ select: { embyServerId: true, embyUserId: true, user: { select: { username: true } } } });
    for (const l of links as any[]) {
      linkByServerAndName.set(`${l.embyServerId}:${String(l.user?.username || "").toLowerCase()}`, l.embyUserId);
      linkByServerAndEmbyUserId.set(`${l.embyServerId}:${l.embyUserId}`, l.embyUserId);
    }

    let collected = 0;
    let snapshots = 0;

    for (const s of servers) {
      const apiKey = getEmbyApiKeyForServer(s as any);
      if (!apiKey) continue;

      // snapshot sessions for ip/client补全
      try {
        const ses = await embyFetchSessions(s.baseUrl, apiKey);
        if (ses.ok) {
          await prisma.sessionSnapshot.create({
            data: {
              embyServerId: s.id,
              capturedAt: new Date(),
              sessionCount: (ses.sessions ?? []).length,
              rawJson: (ses.sessions ?? []).map((x: any) => ({
                userId: x?.UserId ?? null,
                userName: x?.UserName ?? null,
                client: x?.Client ?? null,
                app: x?.ApplicationVersion ?? null,
                device: x?.DeviceName ?? null,
                paused: !!x?.PlayState?.IsPaused,
                ip: x?.RemoteEndPoint ?? null,
                nowPlaying: x?.NowPlayingItem?.Name ?? x?.NowPlayingItem?.SeriesName ?? null,
              })),
            },
          });
          snapshots += 1;
        }
      } catch {}

      const rows = await fetchActivityEntries(s.baseUrl, apiKey, 1200);
      for (const r of rows) {
        const p = parseActivity(r);
        if (!p || !p.userName || !p.mediaName) continue;

        const embyUserId =
          linkByServerAndName.get(`${s.id}:${String(p.userName).toLowerCase()}`) ||
          pickString(r, ["UserId", "userId"]) ||
          null;

        if (!embyUserId) continue;

        try {
          await prisma.playbackEvent.create({
            data: {
              embyServerId: s.id,
              activityId: p.activityId,
              embyUserId,
              userName: p.userName,
              eventType: p.eventType,
              mediaName: p.mediaName,
              mediaKey: p.mediaKey || normalizeMediaKey(p.mediaName),
              client: p.client,
              ip: p.ip,
              occurredAt: p.occurredAt,
              sourceJson: p.sourceJson,
            },
          });
          collected += 1;
        } catch {
          // duplicate or parse issue ignore
        }
      }
    }

    const finishedAt = new Date();
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: true, message: JSON.stringify({ collected, snapshots }) } });
    return NextResponse.json({ ok: true, collected, snapshots, jobRunId: job.id });
  } catch (e: any) {
    const finishedAt = new Date();
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: false, message: String(e?.message ?? e) } });
    return NextResponse.json({ error: "job_failed", message: String(e?.message ?? e), jobRunId: job.id }, { status: 500 });
  }
}
