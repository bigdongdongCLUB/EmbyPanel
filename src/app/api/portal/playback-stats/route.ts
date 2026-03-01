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
    if (!rows.length) continue;

    const dedupe = new Set<string>();
    for (const r of rows) {
      const mediaName = pickString(r, ["ItemName", "itemName", "Name", "name", "Item", "item", "NowPlayingItemName"]);
      const lastPlayedAt = pickDate(r);
      const durationSeconds = normalizeDurationSeconds(r?.PlaybackDuration ?? r?.playbackDuration ?? r?.Duration ?? r?.PlayDuration ?? 0);
      const itemId = pickString(r, ["ItemId", "itemId", "MediaId", "mediaId"]) || null;
      const client = pickString(r, ["ClientName", "clientName", "Client", "client", "DeviceName", "deviceName"]) || "-";
      const ip = pickString(r, ["RemoteAddress", "remoteAddress", "IpAddress", "ipAddress", "IPAddress"]) || "-";

      if (!mediaName && !itemId) continue;
      if (!lastPlayedAt) continue;

      const t = new Date(lastPlayedAt).getTime();
      if (Number.isFinite(t) && t < since.getTime()) continue;

      const key = `${itemId || mediaName}|${lastPlayedAt}|${client}|${ip}`;
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
  }

  records.sort((a, b) => new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime());

  const totalDurationSeconds = records.reduce((sum, r) => sum + (Number.isFinite(r.durationSeconds) ? r.durationSeconds : 0), 0);
  const uniqueSet = new Set(records.map((r) => `${r.serverId}:${r.itemId || r.mediaName}`));

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
