export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { normalizeBaseUrl } from "@/lib/emby";

function daysLeft(endAt?: Date | null) {
  if (!endAt) return 0;
  const diff = endAt.getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 3600 * 1000));
}

type RecentItem = {
  id: string;
  title: string;
  type: "MOVIE" | "TV";
  year: string;
  imageUrl: string | null;
  serverName: string;
  ts: number;
};

type EmbyLatestItem = {
  Id?: string;
  Name?: string;
  Type?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  DateCreated?: string;
  PremiereDate?: string;
  DateLastMediaAdded?: string;
  ProductionYear?: number;
  ImageTags?: { Primary?: string };
};

async function fetchServerRecent(baseUrl: string, apiKey: string, serverName: string): Promise<RecentItem[]> {
  const base = normalizeBaseUrl(baseUrl);

  async function fetchLatestLike(): Promise<EmbyLatestItem[]> {
    // 1) 优先 /Items/Latest（部分服务端可能不支持）
    const latestUrl = new URL(base + "/Items/Latest");
    latestUrl.searchParams.set("api_key", apiKey);
    latestUrl.searchParams.set("Limit", "50");
    latestUrl.searchParams.set("IncludeItemTypes", "Movie,Series,Episode");
    latestUrl.searchParams.set("Fields", "DateCreated,PremiereDate,ProductionYear,ImageTags,Type,SeriesName,ParentIndexNumber,IndexNumber");
    const latestRes = await fetch(latestUrl.toString(), { cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (latestRes.ok) {
      const arr = (await latestRes.json().catch(() => [])) as EmbyLatestItem[];
      if (Array.isArray(arr)) return arr;
    }

    // 2) 回退 /Items + DateCreated 排序（兼容 404 的服务端）
    const itemsUrl = new URL(base + "/Items");
    itemsUrl.searchParams.set("api_key", apiKey);
    itemsUrl.searchParams.set("Recursive", "true");
    itemsUrl.searchParams.set("IncludeItemTypes", "Movie,Series,Episode");
    itemsUrl.searchParams.set("SortBy", "DateCreated");
    itemsUrl.searchParams.set("SortOrder", "Descending");
    itemsUrl.searchParams.set("Limit", "50");
    itemsUrl.searchParams.set("Fields", "DateCreated,PremiereDate,ProductionYear,ImageTags,Type,SeriesName,ParentIndexNumber,IndexNumber");

    const itemsRes = await fetch(itemsUrl.toString(), { cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!itemsRes.ok) return [];
    const json = await itemsRes.json().catch(() => null as any);
    return Array.isArray(json?.Items) ? (json.Items as EmbyLatestItem[]) : [];
  }

  const arr = await fetchLatestLike();
  if (!arr.length) return [];

  const since72h = Date.now() - 72 * 60 * 60 * 1000;

  const rows = arr
    .filter((x) => x && x.Id && (x.Type === "Movie" || x.Type === "Series" || x.Type === "Episode"))
    .filter((x) => {
      const tsRaw = x.DateCreated || x.PremiereDate || x.DateLastMediaAdded || null;
      const ts = tsRaw ? new Date(tsRaw).getTime() : 0;
      return Number.isFinite(ts) && ts > 0 && ts >= since72h;
    })
    .map((x) => {
      const tsRaw = x.DateCreated || x.PremiereDate || x.DateLastMediaAdded || null;
      const ts = tsRaw ? new Date(tsRaw).getTime() : 0;
      const imageTag = x.ImageTags?.Primary;
      const imageUrl = imageTag ? `${base}/Items/${x.Id}/Images/Primary?fillHeight=420&fillWidth=280&quality=90&tag=${imageTag}` : null;
      const year = String(x.ProductionYear || "");

      if (x.Type === "Episode") {
        return {
          id: String(x.Id),
          title: String(x.SeriesName || x.Name || ""),
          type: "TV" as const,
          year,
          imageUrl,
          serverName,
          ts: Number.isFinite(ts) ? ts : 0,
        };
      }

      return {
        id: String(x.Id),
        title: String(x.Name || ""),
        type: x.Type === "Movie" ? ("MOVIE" as const) : ("TV" as const),
        year,
        imageUrl,
        serverName,
        ts: Number.isFinite(ts) ? ts : 0,
      };
    });

  return rows.filter((x, idx, list) => list.findIndex((k) => `${k.type}:${k.title}` === `${x.type}:${x.title}`) === idx);
}

async function enrichRecentWithTmdb(items: RecentItem[]): Promise<RecentItem[]> {
  if (!items.length) return items;

  const settingRow = await prisma.appSetting.findUnique({ where: { key: "vod_settings" } });
  const tmdbKey = String((settingRow?.valueJson as any)?.tmdbApiKey || "").trim();
  if (!tmdbKey) return items;

  const TMDB = "https://api.themoviedb.org/3";

  const out = await Promise.all(
    items.map(async (it) => {
      try {
        const q = encodeURIComponent(it.title);
        const kind = it.type === "MOVIE" ? "movie" : "tv";
        const url = `${TMDB}/search/${kind}?query=${q}&page=1&api_key=${tmdbKey}&language=zh-CN`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
        if (!res.ok) return it;
        const json = await res.json().catch(() => null as any);
        const hit = (json?.results || [])[0];
        if (!hit) return it;
        const poster = hit.poster_path ? `https://image.tmdb.org/t/p/w342${hit.poster_path}` : null;
        const year = String((hit.release_date || hit.first_air_date || "").slice(0, 4) || it.year || "");
        return { ...it, imageUrl: poster || it.imageUrl, year };
      } catch {
        return it;
      }
    })
  );

  return out;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      balanceCents: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        orderBy: { endAt: "desc" },
        take: 1,
        select: { endAt: true, startAt: true, payCycle: true, plan: { select: { name: true } } },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sub = user.subscriptions?.[0] ?? null;
  const endAt = sub?.endAt ?? null;

  const row = await prisma.appSetting.findUnique({ where: { key: "announcements_list" } });
  const raw = Array.isArray(row?.valueJson) ? (row!.valueJson as any[]) : [];
  const announcements = raw
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map((x) => ({ id: String(x.id || ""), title: String(x.title || ""), content: String(x.content || "") }));

  if (!announcements.length) {
    announcements.push({
      id: "default",
      title: "系统公告",
      content: "欢迎使用用户中心。购买订阅或使用卡密兑换后，可在此查看最新订阅状态与剩余时间。",
    });
  }

  const links = await prisma.embyUserLink.findMany({
    where: { userId: user.id, disabled: false },
    include: { embyServer: true },
  });

  const recentFromServers = await Promise.all(
    links.map(async (link) => {
      const server = link.embyServer;
      if (!server?.enabled || !server?.baseUrl) return [] as RecentItem[];
      try {
        const apiKey = getEmbyApiKeyForServer(server as any);
        if (!apiKey) return [] as RecentItem[];
        return await fetchServerRecent(server.baseUrl, apiKey, server.name || "服务器");
      } catch {
        return [] as RecentItem[];
      }
    })
  );

  const mergedRecent = recentFromServers
    .flat()
    .sort((a, b) => b.ts - a.ts)
    .filter((x, idx, arr) => arr.findIndex((k) => `${k.serverName}:${k.id}` === `${x.serverName}:${x.id}`) === idx);

  const enrichedRecent = await enrichRecentWithTmdb(mergedRecent);
  const recentUpdatesTv = enrichedRecent.filter((x) => x.type === "TV").slice(0, 18);
  const recentUpdatesMovie = enrichedRecent.filter((x) => x.type === "MOVIE").slice(0, 18);

  return NextResponse.json({
    ok: true,
    dashboard: {
      balanceYuan: (user.balanceCents ?? 0) / 100,
      subscriptionEndAt: endAt,
      subscriptionPlan: sub?.plan?.name ?? "无订阅",
      remainingDays: daysLeft(endAt),
    },
    announcements,
    recentUpdates: enrichedRecent.slice(0, 18),
    recentUpdatesTv,
    recentUpdatesMovie,
  });
}
