export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { normalizeBaseUrl } from "@/lib/emby";
import { isVodLibraryMatch } from "@/lib/vod-library-match";
import type { LibraryMediaCandidate } from "@/lib/vod-library-match";

type CheckItem = {
  id: number;           // TMDB id
  title: string;
  titleOriginal: string;
  year?: number | string | null;
  mediaType: "movie" | "tv";
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as { username?: string | null })?.username ?? undefined;
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
      const apiKey = getEmbyApiKeyForServer(server);
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
            const data = (await res.json()) as { Items?: LibraryMediaCandidate[] };
            const list = data.Items ?? [];
            const found = list.some((e) => isVodLibraryMatch(e, item));
            if (found) {
              inLibraryIds.add(item.id);
              return;
            }
            // Also try originalTitle if not found
            if (item.titleOriginal && item.titleOriginal !== item.title) {
              const url2 = `${base}/Items?SearchTerm=${encodeURIComponent(item.titleOriginal)}&IncludeItemTypes=${types}&Recursive=true&api_key=${apiKey}&Limit=50&Fields=${encodeURIComponent(fields)}`;
              const res2 = await fetch(url2, { signal: AbortSignal.timeout(7000) });
              if (!res2.ok) return;
              const data2 = (await res2.json()) as { Items?: LibraryMediaCandidate[] };
              const list2 = data2.Items ?? [];
              const found2 = list2.some((e) => isVodLibraryMatch(e, item));
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
