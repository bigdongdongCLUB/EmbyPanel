export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { normalizeBaseUrl } from "@/lib/emby";
import { scoreVodLibraryMatch } from "@/lib/vod-library-match";

const TMDB_BASE = "https://api.themoviedb.org/3";

type EmbyItem = {
  Id?: string;
  Name?: string;
  OriginalTitle?: string;
  ProductionYear?: number;
  ProviderIds?: Record<string, string>;
};

type EmbyItemsResponse<T = EmbyItem> = { Items?: T[] };
type SeasonItem = { IndexNumber?: number | string | null };
type TmdbSeason = { season_number: number; name: string; episode_count: number };
type TmdbDetail = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  seasons?: TmdbSeason[];
};

async function fetchJsonWithRetry<T = unknown>(url: string, timeoutMs = 5000, retries = 1): Promise<T> {
  let lastErr: unknown = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e: unknown) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "fetch_failed"));
}

async function searchBestItemByTitle(params: {
  base: string;
  embyKey: string;
  includeType: "Series" | "Movie";
  title: string;
  originalTitle: string;
  year: number | null;
  tmdbId: string;
}) {
  const terms = Array.from(new Set([params.title, params.originalTitle].map((s) => String(s || "").trim()).filter(Boolean)));
  const all: EmbyItem[] = [];

  for (const term of terms) {
    const u = `${params.base}/Items?SearchTerm=${encodeURIComponent(term)}&IncludeItemTypes=${params.includeType}&Recursive=true&api_key=${params.embyKey}&Limit=50&Fields=Name,OriginalTitle,ProductionYear,ProviderIds`;
    try {
      const data = await fetchJsonWithRetry<EmbyItemsResponse>(u, 5000, 1);
      all.push(...(data?.Items ?? []));
    } catch {
      // ignore term-level failure
    }
  }

  const dedup = new Map<string, EmbyItem>();
  for (const x of all) {
    const k = String(x?.Id ?? "");
    if (!k) continue;
    if (!dedup.has(k)) dedup.set(k, x);
  }

  let best: EmbyItem | null = null;
  let bestScore = -1;
  for (const x of dedup.values()) {
    const s = scoreVodLibraryMatch(x, {
      id: params.tmdbId,
      title: params.title,
      titleOriginal: params.originalTitle,
      year: params.year,
    });
    if (s > bestScore) {
      bestScore = s;
      best = x;
    }
  }

  if (best && bestScore >= 70) return best;
  return null;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as { username?: string | null })?.username ?? undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = dbUser.id;

  const url = new URL(req.url);
  const tmdbId = url.searchParams.get("tmdb_id");
  const mediaType = url.searchParams.get("media_type");
  if (!tmdbId || !mediaType) return NextResponse.json({ error: "missing_params" }, { status: 400 });

  const row = await prisma.appSetting.findUnique({ where: { key: "vod_settings" } });
  const settings = (row?.valueJson ?? {}) as { tmdbApiKey?: string };
  const apiKey = (settings.tmdbApiKey ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "tmdb_not_configured" }, { status: 503 });

  try {
    const detailUrl = `${TMDB_BASE}/${mediaType}/${tmdbId}?api_key=${apiKey}&language=zh-CN&append_to_response=seasons,external_ids`;
    const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(8000) });
    if (!detailRes.ok) throw new Error(`TMDB detail ${detailRes.status}`);
    const detail = (await detailRes.json()) as TmdbDetail;

    const seasons =
      mediaType === "tv"
        ? (detail.seasons ?? [])
            .filter((s) => s.season_number > 0)
            .map((s) => ({ seasonNumber: s.season_number, name: s.name, episodeCount: s.episode_count }))
        : [];

    const links = await prisma.embyUserLink.findMany({
      where: { userId: userId, disabled: false },
      include: { embyServer: true },
    });

    const serverResults: Array<{ serverId: string; serverName: string; seasons: Record<number, boolean>; hasMovie: boolean }> = [];
    const searchTitle = (detail.title ?? detail.name ?? "").trim();
    const searchOriginal = (detail.original_title ?? detail.original_name ?? "").trim();
    const yearText = (detail.release_date ?? detail.first_air_date ?? "").slice(0, 4);
    const year = /^\d{4}$/.test(yearText) ? Number(yearText) : null;

    for (const link of links) {
      const server = link.embyServer;
      if (!server?.baseUrl) continue;
      const embyKey = getEmbyApiKeyForServer(server);
      const base = normalizeBaseUrl(server.baseUrl);

      try {
        if (mediaType === "tv") {
          const bestSeries = await searchBestItemByTitle({
            base,
            embyKey,
            includeType: "Series",
            title: searchTitle,
            originalTitle: searchOriginal,
            year,
            tmdbId: String(tmdbId),
          });

          const seasonsPresent: Record<number, boolean> = {};
          for (const s of seasons) seasonsPresent[s.seasonNumber] = false;

          if (bestSeries?.Id) {
            let seasonItems: SeasonItem[] = [];
            try {
              const seasonsUrl = `${base}/Shows/${bestSeries.Id}/Seasons?api_key=${embyKey}`;
              const seasonsData = await fetchJsonWithRetry<EmbyItemsResponse<SeasonItem>>(seasonsUrl, 5000, 1);
              seasonItems = seasonsData?.Items ?? [];
            } catch {
              try {
                const fallbackUrl = `${base}/Items?ParentId=${encodeURIComponent(bestSeries.Id)}&IncludeItemTypes=Season&Recursive=false&api_key=${embyKey}&Limit=200&Fields=IndexNumber`;
                const fallbackData = await fetchJsonWithRetry<EmbyItemsResponse<SeasonItem>>(fallbackUrl, 5000, 1);
                seasonItems = fallbackData?.Items ?? [];
              } catch {
                seasonItems = [];
              }
            }

            for (const s of seasonItems) {
              const idx = Number(s?.IndexNumber);
              if (Number.isFinite(idx) && idx > 0) seasonsPresent[idx] = true;
            }
          }

          serverResults.push({ serverId: server.id, serverName: server.name, seasons: seasonsPresent, hasMovie: false });
        } else {
          const bestMovie = await searchBestItemByTitle({
            base,
            embyKey,
            includeType: "Movie",
            title: searchTitle,
            originalTitle: searchOriginal,
            year,
            tmdbId: String(tmdbId),
          });
          serverResults.push({ serverId: server.id, serverName: server.name, seasons: {}, hasMovie: !!bestMovie?.Id });
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
  } catch (e: unknown) {
    return NextResponse.json({ error: "detail_failed", message: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
