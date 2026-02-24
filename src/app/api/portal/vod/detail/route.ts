export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { normalizeBaseUrl } from "@/lib/emby";

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
  const tmdbId = url.searchParams.get("tmdb_id");
  const mediaType = url.searchParams.get("media_type");
  if (!tmdbId || !mediaType) return NextResponse.json({ error: "missing_params" }, { status: 400 });

  const row = await prisma.appSetting.findUnique({ where: { key: "vod_settings" } });
  const apiKey = ((row?.valueJson as any)?.tmdbApiKey ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "tmdb_not_configured" }, { status: 503 });

  try {
    const detailUrl = `${TMDB_BASE}/${mediaType}/${tmdbId}?api_key=${apiKey}&language=zh-CN&append_to_response=seasons`;
    const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(8000) });
    if (!detailRes.ok) throw new Error(`TMDB detail ${detailRes.status}`);
    const detail = await detailRes.json();

    const seasons =
      mediaType === "tv"
        ? (detail.seasons ?? [])
            .filter((s: any) => s.season_number > 0)
            .map((s: any) => ({ seasonNumber: s.season_number, name: s.name, episodeCount: s.episode_count }))
        : [];

    // Check user's subscribed Emby servers
    const links = await prisma.embyUserLink.findMany({
      where: { userId: userId, disabled: false },
      include: { embyServer: true },
    });

    const serverResults: Array<{ serverId: string; serverName: string; seasons: Record<number, boolean>; hasMovie: boolean }> = [];
    const searchTitle = (detail.title ?? detail.name ?? "").trim();
    const searchOriginal = (detail.original_title ?? detail.original_name ?? "").trim();

    for (const link of links) {
      const server = link.embyServer;
      if (!server?.baseUrl) continue;
      const embyKey = getEmbyApiKeyForServer(server as any);
      const base = normalizeBaseUrl(server.baseUrl);

      try {
        if (mediaType === "tv") {
          const searchUrl = `${base}/Items?SearchTerm=${encodeURIComponent(searchTitle)}&IncludeItemTypes=Series&Recursive=true&api_key=${embyKey}&Limit=5`;
          const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
          const searchData = searchRes.ok ? await searchRes.json() : null;
          const series = (searchData?.Items ?? []).find(
            (item: any) =>
              item.Name?.toLowerCase().includes(searchTitle.toLowerCase()) ||
              (searchOriginal && item.Name?.toLowerCase().includes(searchOriginal.toLowerCase()))
          );

          const seasonsPresent: Record<number, boolean> = {};
          for (const s of seasons) seasonsPresent[s.seasonNumber] = false;

          if (series?.Id) {
            const seasonsUrl = `${base}/Shows/${series.Id}/Seasons?api_key=${embyKey}`;
            const seasonsRes = await fetch(seasonsUrl, { signal: AbortSignal.timeout(5000) });
            const seasonsData = seasonsRes.ok ? await seasonsRes.json() : null;
            for (const s of seasonsData?.Items ?? []) {
              if (s.IndexNumber > 0) seasonsPresent[s.IndexNumber] = true;
            }
          }
          serverResults.push({ serverId: server.id, serverName: server.name, seasons: seasonsPresent, hasMovie: false });
        } else {
          const searchUrl = `${base}/Items?SearchTerm=${encodeURIComponent(searchTitle)}&IncludeItemTypes=Movie&Recursive=true&api_key=${embyKey}&Limit=5`;
          const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
          const searchData = searchRes.ok ? await searchRes.json() : null;
          serverResults.push({ serverId: server.id, serverName: server.name, seasons: {}, hasMovie: (searchData?.Items ?? []).length > 0 });
        }
      } catch {
        serverResults.push({ serverId: server.id, serverName: server.name, seasons: {}, hasMovie: false });
      }
    }

    return NextResponse.json({
      ok: true,
      detail: {
        id: detail.id,
        title: detail.title ?? detail.name ?? "",
        titleOriginal: detail.original_title ?? detail.original_name ?? "",
        overview: detail.overview ?? "",
        posterPath: detail.poster_path ? `https://image.tmdb.org/t/p/w342${detail.poster_path}` : null,
        year: (detail.release_date ?? detail.first_air_date ?? "").slice(0, 4),
        rating: detail.vote_average ? Number(detail.vote_average.toFixed(1)) : null,
        mediaType,
        seasons,
      },
      serverResults,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "detail_failed", message: e?.message }, { status: 502 });
  }
}
