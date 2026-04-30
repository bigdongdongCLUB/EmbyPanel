export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
const TMDB_BASE = "https://api.themoviedb.org/3";
const cache = new Map<string, { data: unknown; expiresAt: number }>();

type SessionWithUsername = { username?: string | null };
type VodSettings = { tmdbApiKey?: string; tmdbCacheHours?: number | string | null };
type TmdbItem = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
};
type TmdbListResponse = { results?: TmdbItem[]; total_results?: number; total_pages?: number };

type DiscoverItem = {
  id: number;
  title: string;
  titleOriginal: string;
  posterPath: string | null;
  year: string;
  rating: number | null;
  mediaType: "movie" | "tv";
  requestedSeason?: number;
  requestCount?: number;
};

type TrendingVodRow = {
  tmdbId: number;
  title: string;
  titleOriginal: string;
  posterPath: string | null;
  year: string | null;
  mediaType: "MOVIE" | "TV";
  season: number | null;
  createdAt: Date;
};

type TrendingGroup = {
  key: string;
  count: number;
  firstCreatedAt: Date;
  row: TrendingVodRow;
};

async function tmdbFetch<T = unknown>(path: string, apiKey: string, cacheHours = 12): Promise<T> {
  const hit = cache.get(path);
  if (hit && hit.expiresAt > Date.now()) return hit.data as T;
  const url = `${TMDB_BASE}${path}&api_key=${apiKey}&language=zh-CN`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = (await res.json()) as T;
  cache.set(path, { data, expiresAt: Date.now() + cacheHours * 3600 * 1000 });
  return data;
}

function mapItem(item: TmdbItem, mediaType: "movie" | "tv"): DiscoverItem {
  return {
    id: item.id,
    title: item.title ?? item.name ?? "",
    titleOriginal: item.original_title ?? item.original_name ?? "",
    posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
    year: (item.release_date ?? item.first_air_date ?? "").slice(0, 4),
    rating: item.vote_average ? Number(item.vote_average.toFixed(1)) : null,
    mediaType,
  };
}

async function enrichTrendingItem(item: DiscoverItem, apiKey: string, cacheHours: number): Promise<DiscoverItem> {
  try {
    const data = await tmdbFetch<TmdbItem>(`/${item.mediaType}/${item.id}?`, apiKey, cacheHours);
    return {
      ...item,
      title: data.title ?? data.name ?? item.title,
      titleOriginal: data.original_title ?? data.original_name ?? item.titleOriginal,
      posterPath: data.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : item.posterPath,
      year: String((data.release_date ?? data.first_air_date ?? item.year ?? "").slice(0, 4)),
      rating: data.vote_average ? Number(data.vote_average.toFixed(1)) : item.rating,
    };
  } catch {
    return item;
  }
}

async function loadTrendingRequests(params: {
  category: string;
  userId: string;
  apiKey: string;
  cacheHours: number;
}) {
  const isTv = params.category === "requested_tv";
  const mediaType = isTv ? "TV" : "MOVIE";
  const rows = await prisma.vodRequest.findMany({
    where: isTv ? { mediaType, season: { not: null } } : { mediaType },
    orderBy: { createdAt: "asc" },
    select: { tmdbId: true, title: true, titleOriginal: true, posterPath: true, year: true, mediaType: true, season: true, createdAt: true },
  });

  const groupMap = new Map<string, TrendingGroup>();
  for (const row of rows) {
    const key = isTv ? `${row.tmdbId}:${row.season}` : String(row.tmdbId);
    const current = groupMap.get(key);
    if (!current) {
      groupMap.set(key, { key, count: 1, firstCreatedAt: row.createdAt, row });
      continue;
    }
    current.count += 1;
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.firstCreatedAt.getTime() - b.firstCreatedAt.getTime();
  });

  const results: DiscoverItem[] = [];
  for (const group of groups) {
    if (results.length >= 12) break;
    const row = group.row;

    const item = await enrichTrendingItem(
      {
        id: row.tmdbId,
        title: row.title,
        titleOriginal: row.titleOriginal,
        posterPath: row.posterPath,
        year: row.year ?? "",
        rating: null,
        mediaType: row.mediaType === "TV" ? "tv" : "movie",
        requestedSeason: row.season ?? undefined,
        requestCount: group.count,
      },
      params.apiKey,
      params.cacheHours
    );

    results.push(item);
  }

  return results;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as SessionWithUsername)?.username ?? undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get("category") ?? "now_playing_movie";
  const page = Math.min(10, Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1));

  const row = await prisma.appSetting.findUnique({ where: { key: "vod_settings" } });
  const settings = (row?.valueJson ?? {}) as VodSettings;
  const apiKey = (settings.tmdbApiKey ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "tmdb_not_configured" }, { status: 503 });
  const cacheHours = Number(settings.tmdbCacheHours ?? 12);

  if (category === "requested_movie" || category === "requested_tv") {
    try {
      const results = await loadTrendingRequests({ category, userId: dbUser.id, apiKey, cacheHours });
      return NextResponse.json({ ok: true, results, totalResults: results.length, page: 1, totalPages: 1 });
    } catch (e: unknown) {
      return NextResponse.json({ error: "trending_requests_failed", message: e instanceof Error ? e.message : String(e), category }, { status: 502 });
    }
  }

  const paths: Record<string, string> = {
    now_playing_movie: `/movie/now_playing?page=${page}`,
    now_playing_tv: `/tv/on_the_air?page=${page}`,
    popular_movie: `/movie/popular?page=${page}`,
    popular_tv: `/tv/popular?page=${page}`,
  };
  const path = paths[category];
  if (!path) return NextResponse.json({ error: "invalid_category" }, { status: 400 });

  try {
    const data = await tmdbFetch<TmdbListResponse>(path, apiKey, cacheHours);
    const mt = category.endsWith("_tv") ? "tv" : "movie";
    return NextResponse.json({
      ok: true,
      results: (data.results ?? []).slice(0, 18).map((i) => mapItem(i, mt)),
      totalResults: data.total_results ?? 0,
      page,
      totalPages: data.total_pages ?? 1,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: "tmdb_fetch_failed", message: e instanceof Error ? e.message : String(e), category, path }, { status: 502 });
  }
}
