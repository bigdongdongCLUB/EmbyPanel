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
  mediaType: "movie" | "tv";
};

// Simple title normalize: lowercase, remove punctuation, spaces
function norm(s: string) {
  return s.toLowerCase().replace(/[^\w\u4e00-\u9fff]/g, "");
}

function titleMatch(embyName: string, item: CheckItem) {
  const n = norm(embyName);
  return (
    n === norm(item.title) ||
    n === norm(item.titleOriginal) ||
    n.includes(norm(item.title)) ||
    (item.titleOriginal && n.includes(norm(item.titleOriginal)))
  );
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
            const url = `${base}/Items?SearchTerm=${encodeURIComponent(item.title)}&IncludeItemTypes=${types}&Recursive=true&api_key=${apiKey}&Limit=5&Fields=Name`;
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) return;
            const data = await res.json();
            const found = (data.Items ?? []).some((e: any) => titleMatch(e.Name ?? "", item));
            if (found) inLibraryIds.add(item.id);
            // Also try originalTitle if not found
            if (!found && item.titleOriginal && item.titleOriginal !== item.title) {
              const url2 = `${base}/Items?SearchTerm=${encodeURIComponent(item.titleOriginal)}&IncludeItemTypes=${types}&Recursive=true&api_key=${apiKey}&Limit=5&Fields=Name`;
              const res2 = await fetch(url2, { signal: AbortSignal.timeout(5000) });
              if (!res2.ok) return;
              const data2 = await res2.json();
              if ((data2.Items ?? []).some((e: any) => titleMatch(e.Name ?? "", item))) {
                inLibraryIds.add(item.id);
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
