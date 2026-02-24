export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username as string | undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = dbUser.id;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.min(10, Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1));
  if (!q) return NextResponse.json({ ok: true, results: [], totalResults: 0 });

  const row = await prisma.appSetting.findUnique({ where: { key: "vod_settings" } });
  const apiKey = ((row?.valueJson as any)?.tmdbApiKey ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "tmdb_not_configured" }, { status: 503 });

  try {
    const apiUrl = `${TMDB_BASE}/search/multi?query=${encodeURIComponent(q)}&page=${page}&api_key=${apiKey}&language=zh-CN`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();
    const results = (data.results ?? [])
      .filter((item: any) => item.media_type === "movie" || item.media_type === "tv")
      .slice(0, 18)
      .map((item: any) => ({
        id: item.id,
        title: item.title ?? item.name ?? "",
        titleOriginal: item.original_title ?? item.original_name ?? "",
        posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
        year: (item.release_date ?? item.first_air_date ?? "").slice(0, 4),
        rating: item.vote_average ? Number(item.vote_average.toFixed(1)) : null,
        mediaType: item.media_type,
      }));
    return NextResponse.json({ ok: true, results, totalResults: data.total_results ?? 0, page, totalPages: data.total_pages ?? 1 });
  } catch (e: any) {
    return NextResponse.json({ error: "search_failed", message: e?.message }, { status: 502 });
  }
}
