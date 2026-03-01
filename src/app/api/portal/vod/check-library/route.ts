export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { normalizeBaseUrl } from "@/lib/emby";

type CheckItem = {
  id: number;           // TMDB id
  title: string;
  titleOriginal: string;
  year?: number;
  mediaType: "movie" | "tv";
};

// Simple title normalize: lowercase, remove punctuation, spaces
function norm(s: string) {
  return s.toLowerCase().replace(/[^\w\u4e00-\u9fff]/g, "");
}

function titleMatch(embyName: string, item: CheckItem) {
  const n = norm(embyName);
  const t = norm(item.title);
  const o = norm(item.titleOriginal || "");
  if (!n) return false;
  return n === t || n === o || n.includes(t) || (!!o && n.includes(o)) || t.includes(n) || (!!o && o.includes(n));
}

function byTmdbId(entry: any, tmdbId: number) {
  const pid = entry?.ProviderIds?.Tmdb ?? entry?.ProviderIds?.TMDB ?? entry?.ProviderIds?.tmdb;
  return String(pid || "") === String(tmdbId);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username as string | undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const items: CheckItem[] = body?.items ?? [];
  if (!items.length) return NextResponse.json({ inLibrary: [] });

  // Get user's subscribed Emby servers
  const links = await prisma.embyUserLink.findMany({
    where: { userId: dbUser.id, disabled: false },
    include: { embyServer: true },
  });

  if (!links.length) return NextResponse.json({ inLibrary: [] });

  const inLibraryIds = new Set<number>();

  // For each server: search all items in parallel
  await Promise.allSettled(
    links.map(async (link) => {
      const server = link.embyServer;
      if (!server?.baseUrl) return;
      const apiKey = getEmbyApiKeyForServer(server as any);
      const base = normalizeBaseUrl(server.baseUrl);

      // Batch: search each item in parallel within this server
      await Promise.allSettled(
        items.map(async (item) => {
          if (inLibraryIds.has(item.id)) return; // already found, skip
          try {
            const types = item.mediaType === "movie" ? "Movie" : "Series";
            const fields = "Name,OriginalTitle,ProductionYear,ProviderIds";
            const url = `${base}/Items?SearchTerm=${encodeURIComponent(item.title)}&IncludeItemTypes=${types}&Recursive=true&api_key=${apiKey}&Limit=50&Fields=${encodeURIComponent(fields)}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
            if (!res.ok) return;
            const data = await res.json();
            const list = data.Items ?? [];
            let found = list.some((e: any) => byTmdbId(e, item.id));
            if (!found) {
              found = list.some((e: any) => titleMatch(e.Name ?? e.OriginalTitle ?? "", item));
            }
            if (found) {
              inLibraryIds.add(item.id);
              return;
            }
            // Also try originalTitle if not found
            if (item.titleOriginal && item.titleOriginal !== item.title) {
              const url2 = `${base}/Items?SearchTerm=${encodeURIComponent(item.titleOriginal)}&IncludeItemTypes=${types}&Recursive=true&api_key=${apiKey}&Limit=50&Fields=${encodeURIComponent(fields)}`;
              const res2 = await fetch(url2, { signal: AbortSignal.timeout(7000) });
              if (!res2.ok) return;
              const data2 = await res2.json();
              const list2 = data2.Items ?? [];
              const found2 = list2.some((e: any) => byTmdbId(e, item.id)) || list2.some((e: any) => titleMatch(e.Name ?? e.OriginalTitle ?? "", item));
              if (found2) {
                inLibraryIds.add(item.id);
                return;
              }
            }
          } catch {
            // ignore per-item errors
          }
        })
      );
    })
  );

  return NextResponse.json({ inLibrary: Array.from(inLibraryIds) });
}
