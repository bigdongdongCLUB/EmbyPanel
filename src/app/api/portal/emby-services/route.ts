export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { normalizeBaseUrl } from "@/lib/emby";

async function fetchItemCounts(baseUrl: string, apiKey: string) {
  try {
    const u = new URL(normalizeBaseUrl(baseUrl) + "/Items/Counts");
    u.searchParams.set("api_key", apiKey);
    const res = await fetch(u.toString(), { cache: "no-store", headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json) return null;
    return {
      movieCount: Number(json.MovieCount ?? 0),
      seriesCount: Number(json.SeriesCount ?? 0),
      episodeCount: Number(json.EpisodeCount ?? 0),
      songCount: Number(json.SongCount ?? 0),
    };
  } catch {
    return null;
  }
}

async function fetchServerVersion(baseUrl: string, apiKey: string) {
  const base = normalizeBaseUrl(baseUrl);
  try {
    const u = new URL(base + "/System/Info");
    u.searchParams.set("api_key", apiKey);
    const res = await fetch(u.toString(), { cache: "no-store", headers: { Accept: "application/json" } });
    if (res.ok) {
      const json = await res.json().catch(() => null as any);
      const v = String(json?.Version || "").trim();
      if (v) return v;
    }
  } catch {}

  try {
    const res = await fetch(base + "/System/Info/Public", { cache: "no-store", headers: { Accept: "application/json" } });
    if (res.ok) {
      const json = await res.json().catch(() => null as any);
      const v = String(json?.Version || "").trim();
      if (v) return v;
    }
  } catch {}

  return "";
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
      username: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        orderBy: { endAt: "desc" },
        take: 1,
        select: {
          id: true,
          startAt: true,
          endAt: true,
          plan: { select: { id: true, name: true } },
          servers: { select: { embyServerId: true } },
        },
      },
      embyLinks: { select: { embyServerId: true, embyUserId: true, disabled: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const activeSub = user.subscriptions?.[0] ?? null;
  const serverIds = new Set<string>([
    ...(activeSub?.servers?.map((s) => s.embyServerId) ?? []),
    ...user.embyLinks.map((l) => l.embyServerId),
  ]);

  const servers = await prisma.embyServer.findMany({
    where: { id: { in: Array.from(serverIds) } },
    select: { id: true, name: true, baseUrl: true, enabled: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true, lastHealthOk: true },
    orderBy: { createdAt: "asc" },
  });

  const linkMap = new Map(user.embyLinks.map((l) => [l.embyServerId, { embyUserId: l.embyUserId, disabled: !!l.disabled }] as const));

  const list = await Promise.all(
    servers.map(async (s) => {
      const apiKey = getEmbyApiKeyForServer(s as any);
      const [counts, version] = await Promise.all([
        apiKey ? fetchItemCounts(s.baseUrl, apiKey) : Promise.resolve(null),
        apiKey ? fetchServerVersion(s.baseUrl, apiKey) : Promise.resolve(""),
      ]);

      const link = linkMap.get(s.id) ?? null;
      const onlineNow = !!String(version || "").trim() || s.lastHealthOk === true;
      return {
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        online: onlineNow,
        banned: !!link?.disabled,
        version,
        baseUrl: s.baseUrl,
        embyUserId: link?.embyUserId ?? null,
        counts: counts ?? { movieCount: 0, seriesCount: 0, episodeCount: 0, songCount: 0 },
      };
    })
  );

  const onlineCount = list.filter((x) => x.online).length;
  const aggregate = list.reduce(
    (acc, cur) => {
      acc.movieCount += cur.counts.movieCount || 0;
      acc.seriesCount += cur.counts.seriesCount || 0;
      acc.episodeCount += cur.counts.episodeCount || 0;
      acc.songCount += cur.counts.songCount || 0;
      return acc;
    },
    { movieCount: 0, seriesCount: 0, episodeCount: 0, songCount: 0 }
  );

  return NextResponse.json({
    ok: true,
    subscription: {
      planName: activeSub?.plan?.name ?? "无订阅",
      endAt: activeSub?.endAt ?? null,
      serverCount: list.length,
      onlineCount,
    },
    aggregate,
    servers: list,
    user: { username: user.username },
  });
}
