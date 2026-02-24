export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const TMDB_BASE = "https://api.themoviedb.org/3";
const cache = new Map<string, { data: any; expiresAt: number }>();

async function tmdbFetch(path: string, apiKey: string, cacheHours = 12) {
  const hit = cache.get(path);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const url = `${TMDB_BASE}${path}&api_key=${apiKey}&language=zh-CN`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  cache.set(path, { data, expiresAt: Date.now() + cacheHours * 3600 * 1000 });
  return data;
}

function mapItem(item: any, mediaType: string) {
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

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username as string | undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = dbUser.id;

  const url = new URL(req.url);
  const category = url.searchParams.get("category") ?? "now_playing_movie";
  const page = Math.min(10, Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1));

  const row = await prisma.appSetting.findUnique({ where: { key: "vod_settings" } });
  const settings = (row?.valueJson as any) ?? {};
  const apiKey = (settings.tmdbApiKey ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "tmdb_not_configured" }, { status: 503 });
  const cacheHours = Number(settings.tmdbCacheHours ?? 12);

  const paths: Record<string, string> = {
    now_playing_movie: `/movie/now_playing?page=${page}`,
    now_playing_tv: `/tv/on_the_air?page=${page}`,
    popular_movie: `/movie/popular?page=${page}`,
    popular_tv: `/tv/popular?page=${page}`,
  };
  const path = paths[category];
  if (!path) return NextResponse.json({ error: "invalid_category" }, { status: 400 });

  try {
    const data = await tmdbFetch(path, apiKey, cacheHours);
    const mt = category.endsWith("_tv") ? "tv" : "movie";
    return NextResponse.json({
      ok: true,
      results: (data.results ?? []).slice(0, 15).map((i: any) => mapItem(i, mt)),
      totalResults: data.total_results ?? 0,
      page,
      totalPages: data.total_pages ?? 1,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "tmdb_fetch_failed", message: e?.message, category, path }, { status: 502 });
  }
}
