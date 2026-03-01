export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { normalizeBaseUrl } from "@/lib/emby";

function sqlSafe(v: string) {
  return String(v || "").replace(/'/g, "''");
}

function normalizeDurationSeconds(raw: any) {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // ticks (100ns)
  if (n > 10_000_000_000) return Math.round(n / 10_000_000);
  // milliseconds
  if (n > 100_000) return Math.round(n / 1000);
  // already seconds
  return Math.round(n);
}

function pickString(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function pickStringFuzzy(obj: any, includes: string[]) {
  if (!obj || typeof obj !== "object") return "";
  const keys = Object.keys(obj);
  for (const k of keys) {
    const lk = k.toLowerCase();
    if (includes.some((x) => lk.includes(x))) {
      const v = obj[k];
      if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
    }
  }
  return "";
}

function pickDate(obj: any) {
  const raw = pickString(obj, ["DateCreated", "dateCreated", "LastPlayedDate", "lastPlayedDate", "StartDate", "startDate", "Date", "date"]);
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isFinite(d.getTime())) return d.toISOString();
  return raw;
}

function parseRows(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.Rows)) return data.Rows;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.Items)) return data.Items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function submitCustomQuery(baseUrl: string, apiKey: string, query: string) {
  const base = normalizeBaseUrl(baseUrl);
  const url = new URL(base + "/user_usage_stats/submit_custom_query");
  url.searchParams.set("api_key", apiKey);

  const payloads = [
    { CustomQuery: query },
    { customQuery: query },
    { Query: query },
    { query },
  ];

  for (const payload of payloads) {
    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { Accept: "application/json", "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) continue;
      const json = text ? JSON.parse(text) : [];
      return { ok: true as const, rows: parseRows(json) };
    } catch {
      // try next payload
    }
  }

  return { ok: false as const, rows: [] as any[] };
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

function parseActivityEntryToPlayback(entry: any, username: string) {
  const text = [
    pickString(entry, ["Overview", "overview"]),
    pickString(entry, ["Name", "name"]),
    pickString(entry, ["ShortOverview", "shortOverview"]),
  ]
    .filter(Boolean)
    .join(" ");
  if (!text) return null;

  const lower = text.toLowerCase();
  if (!lower.includes(String(username).toLowerCase())) return null;

  const isStart = /(开始播放|start\s*playing|playing)/i.test(text) && !/(已停止播放|stopped)/i.test(text);
  const isStop = /(已停止播放|stop\s*playing|stopped)/i.test(text);
  if (!isStart && !isStop) return null;

  let mediaName = "";
  let client = "-";

  let m = text.match(/在\s*(.+?)\s*上开始播放\s*(.+)$/);
  if (m) {
    client = (m[1] || "").trim() || "-";
    mediaName = (m[2] || "").trim();
  }

  // 兼容: "Mac 上 test07 已停止播放 xxx"
  if (!mediaName) {
    m = text.match(/^\s*(.+?)\s*上\s*.+?\s*已停止播放\s*(.+)$/);
    if (m) {
      client = (m[1] || "").trim() || client;
      mediaName = (m[2] || "").trim();
    }
  }

  if (!mediaName) {
    m = text.match(/上\s*.+?\s*已停止播放\s*(.+)$/);
    if (m) mediaName = (m[1] || "").trim();
  }

  if (!mediaName) {
    m = text.match(/(?:开始播放|已停止播放|start\s*playing|stopped)\s*(.+)$/i);
    if (m) mediaName = (m[1] || "").trim();
  }

  if (!client || client === "-") {
    m = text.match(/在\s*(.+?)\s*上/);
    if (m) client = (m[1] || "").trim() || "-";
  }

  mediaName = mediaName.replace(/^[:：\-\s]+/, "").trim();
  if (!mediaName) return null;

  const dtRaw = pickDate(entry);
  if (!dtRaw) return null;

  return {
    eventType: isStop ? "stop" : "start",
    mediaName,
    mediaKey: normalizeMediaKey(mediaName),
    client: client || "-",
    ip: pickString(entry, ["RemoteEndPoint", "remoteEndPoint", "RemoteAddress", "remoteAddress", "IpAddress", "ipAddress"]) || "-",
    lastPlayedAt: dtRaw,
  };
}

async function fetchActivityEntries(baseUrl: string, apiKey: string, limit = 500) {
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
      const rows = parseRows(json);
      if (rows.length) return { ok: true as const, rows };
    } catch {
      // try next endpoint variant
    }
  }

  return { ok: false as const, rows: [] as any[] };
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
      embyLinks: {
        where: { disabled: false },
        select: {
          embyServerId: true,
          embyUserId: true,
          embyServer: {
            select: { id: true, name: true, baseUrl: true, enabled: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
          },
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

  const records: Array<{
    serverId: string;
    serverName: string;
    mediaName: string;
    itemId: string | null;
    durationSeconds: number;
    client: string;
    ip: string;
    lastPlayedAt: string;
  }> = [];

  for (const l of user.embyLinks) {
    const s = l.embyServer;
    if (!s?.enabled) continue;
    const apiKey = getEmbyApiKeyForServer(s as any);
    if (!apiKey) continue;

    const qByUserId = `SELECT * FROM PlaybackActivity WHERE UserId='${sqlSafe(l.embyUserId)}' LIMIT 3000`;
    const qByUserName = `SELECT * FROM PlaybackActivity WHERE UserName='${sqlSafe(username)}' LIMIT 3000`;

    const first = await submitCustomQuery(s.baseUrl, apiKey, qByUserId);
    const second = await submitCustomQuery(s.baseUrl, apiKey, qByUserName);
    const rows = [...(first.ok ? first.rows : []), ...(second.ok ? second.rows : [])];

    const dedupe = new Set<string>();

    // A) playback-reporting rows (preferred: duration/ip usually more准确)
    for (const r of rows) {
      const mediaName = pickString(r, ["ItemName", "itemName", "Name", "name", "Item", "item", "NowPlayingItemName"]);
      const lastPlayedAt = pickDate(r);
      const startDate = pickString(r, ["StartDate", "startDate", "DateStarted", "dateStarted"]);
      const endDate = pickString(r, ["EndDate", "endDate", "DateStopped", "dateStopped", "StopDate", "stopDate"]);
      let durationSeconds = normalizeDurationSeconds(r?.PlaybackDuration ?? r?.playbackDuration ?? r?.Duration ?? r?.PlayDuration ?? r?.RunTime ?? 0);
      if (durationSeconds <= 0 && startDate && endDate) {
        const st = new Date(startDate).getTime();
        const ed = new Date(endDate).getTime();
        if (Number.isFinite(st) && Number.isFinite(ed) && ed > st) {
          durationSeconds = Math.round((ed - st) / 1000);
        }
      }
      const itemId = pickString(r, ["ItemId", "itemId", "MediaId", "mediaId"]) || pickStringFuzzy(r, ["itemid", "mediaid"]) || null;
      const client = pickString(r, ["ClientName", "clientName", "Client", "client", "DeviceName", "deviceName"]) || pickStringFuzzy(r, ["client", "device"]) || "-";
      const ip = pickString(r, ["RemoteAddress", "remoteAddress", "IpAddress", "ipAddress", "IPAddress", "RemoteEndPoint"])
        || pickStringFuzzy(r, ["remote", "ip", "endpoint", "address"]) || "-";

      if (!mediaName && !itemId) continue;
      if (!lastPlayedAt) continue;

      const t = new Date(lastPlayedAt).getTime();
      if (Number.isFinite(t) && t < since.getTime()) continue;

      const key = `${itemId || normalizeMediaKey(mediaName)}|${lastPlayedAt}|${client}|${ip}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);

      records.push({
        serverId: s.id,
        serverName: s.name,
        mediaName: mediaName || "未知媒体",
        itemId,
        durationSeconds,
        client,
        ip,
        lastPlayedAt,
      });
    }

    // B) ActivityLog fallback + enrich: 用 start/stop 估算时长，补 client/ip
    const activityRes = await fetchActivityEntries(s.baseUrl, apiKey, 1000);
    if (activityRes.ok) {
      const events = activityRes.rows
        .map((e) => parseActivityEntryToPlayback(e, username))
        .filter(Boolean) as Array<{ eventType: "start" | "stop"; mediaName: string; mediaKey: string; client: string; ip: string; lastPlayedAt: string }>;

      events.sort((a, b) => new Date(a.lastPlayedAt).getTime() - new Date(b.lastPlayedAt).getTime());

      const starts = new Map<string, number[]>();
      const stopDerived: Array<{ mediaName: string; client: string; ip: string; lastPlayedAt: string; durationSeconds: number }> = [];

      for (const ev of events) {
        const t = new Date(ev.lastPlayedAt).getTime();
        if (!Number.isFinite(t)) continue;
        if (t < since.getTime()) continue;

        const k = `${ev.mediaKey}|${ev.client}`;
        if (ev.eventType === "start") {
          const arr = starts.get(k) ?? [];
          arr.push(t);
          starts.set(k, arr);
          continue;
        }

        // stop event
        const arr = starts.get(k) ?? [];
        let duration = 0;
        if (arr.length) {
          const st = arr.pop()!;
          starts.set(k, arr);
          duration = Math.max(0, Math.round((t - st) / 1000));
          // limit abnormal huge durations
          if (duration > 24 * 3600) duration = 0;
        }

        stopDerived.push({
          mediaName: ev.mediaName,
          client: ev.client,
          ip: ev.ip,
          lastPlayedAt: ev.lastPlayedAt,
          durationSeconds: duration,
        });
      }

      // merge derived stop records into existing records (补全缺失字段/时长)
      for (const d of stopDerived) {
        const dt = new Date(d.lastPlayedAt).getTime();
        let matched: any = null;
        let bestDelta = Number.POSITIVE_INFINITY;

        for (const r of records) {
          if (r.serverId !== s.id) continue;
          if (normalizeMediaKey(r.mediaName) !== normalizeMediaKey(d.mediaName)) continue;
          const rt = new Date(r.lastPlayedAt).getTime();
          if (!Number.isFinite(rt)) continue;
          const delta = Math.abs(rt - dt);
          if (delta <= 10 * 60 * 1000 && delta < bestDelta) {
            bestDelta = delta;
            matched = r;
          }
        }

        if (matched) {
          if ((!matched.client || matched.client === "-") && d.client && d.client !== "-") matched.client = d.client;
          if ((!matched.ip || matched.ip === "-") && d.ip && d.ip !== "-") matched.ip = d.ip;
          if ((matched.durationSeconds ?? 0) <= 0 && d.durationSeconds > 0) matched.durationSeconds = d.durationSeconds;
          continue;
        }

        const key = `${normalizeMediaKey(d.mediaName)}|${d.lastPlayedAt}|${d.client}|${d.ip}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);

        records.push({
          serverId: s.id,
          serverName: s.name,
          mediaName: d.mediaName,
          itemId: null,
          durationSeconds: d.durationSeconds,
          client: d.client || "-",
          ip: d.ip || "-",
          lastPlayedAt: d.lastPlayedAt,
        });
      }
    }
  }

  records.sort((a, b) => new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime());

  const totalDurationSeconds = records.reduce((sum, r) => sum + (Number.isFinite(r.durationSeconds) ? r.durationSeconds : 0), 0);
  const uniqueSet = new Set(records.map((r) => String(r.itemId || normalizeMediaKey(r.mediaName) || r.mediaName)));

  return NextResponse.json({
    ok: true,
    rangeDays,
    summary: {
      totalDurationSeconds,
      watchedItemCount: uniqueSet.size,
      totalRecords: records.length,
    },
    records,
  });
}
