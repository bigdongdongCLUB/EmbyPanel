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
  const sinceSql = since.toISOString().slice(0, 19).replace("T", " ");

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

    const query = `SELECT ItemId, ItemName, PlaybackDuration, ClientName, DeviceName, RemoteAddress, DateCreated FROM PlaybackActivity WHERE UserId='${sqlSafe(
      l.embyUserId
    )}' AND DateCreated >= '${sqlSafe(sinceSql)}' ORDER BY DateCreated DESC LIMIT 1000`;

    const result = await submitCustomQuery(s.baseUrl, apiKey, query);
    if (!result.ok) continue;

    for (const r of result.rows) {
      const mediaName = String(r?.ItemName ?? r?.itemName ?? r?.Name ?? "").trim();
      const lastPlayedAt = String(r?.DateCreated ?? r?.dateCreated ?? r?.LastPlayedDate ?? "").trim();
      if (!mediaName || !lastPlayedAt) continue;

      records.push({
        serverId: s.id,
        serverName: s.name,
        mediaName,
        itemId: String(r?.ItemId ?? r?.itemId ?? "").trim() || null,
        durationSeconds: normalizeDurationSeconds(r?.PlaybackDuration ?? r?.playbackDuration ?? r?.Duration ?? 0),
        client: String(r?.ClientName ?? r?.clientName ?? r?.DeviceName ?? r?.deviceName ?? "-").trim() || "-",
        ip: String(r?.RemoteAddress ?? r?.remoteAddress ?? "-").trim() || "-",
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
