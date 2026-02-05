export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchUsers } from "@/lib/emby";
import { embyFetchPlugins, hasPlaybackReportingPlugin } from "@/lib/emby-plugins";
import { embyFetchTopPlayedItems } from "@/lib/emby-items";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const serverId = (url.searchParams.get("serverId") ?? "").trim();
  const rangeDays = Number(url.searchParams.get("rangeDays") ?? "30");

  if (!serverId) return NextResponse.json({ error: "missing_serverId" }, { status: 400 });
  if (![7, 30, 180, 365].includes(rangeDays)) return NextResponse.json({ error: "invalid_rangeDays" }, { status: 400 });

  const server = await prisma.embyServer.findUnique({
    where: { id: serverId },
    select: { id: true, name: true, baseUrl: true, enabled: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
  });
  if (!server) return NextResponse.json({ error: "server_not_found" }, { status: 404 });

  const apiKey = getEmbyApiKeyForServer(server);
  if (!apiKey) return NextResponse.json({ error: "missing_emby_api_key" }, { status: 400 });

  const now = new Date();
  const since = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);

  // Require Playback Reporting plugin for this page (per product rules)
  const pluginsRes = await embyFetchPlugins(server.baseUrl, apiKey);
  if (!pluginsRes.ok) {
    return NextResponse.json({
      ok: true,
      server: { id: server.id, name: server.name, baseUrl: server.baseUrl },
      rangeDays,
      pluginInstalled: false,
      requirePlugin: true,
      message: "无法检测插件状态，请确认已安装 Playback Reporting 插件",
      detail: { status: pluginsRes.status, body: pluginsRes.body },
    });
  }

  const installed = hasPlaybackReportingPlugin(pluginsRes.plugins);
  if (!installed) {
    return NextResponse.json({
      ok: true,
      server: { id: server.id, name: server.name, baseUrl: server.baseUrl },
      rangeDays,
      pluginInstalled: false,
      requirePlugin: true,
      message: "需要安装 Playback Reporting 插件才可以进行统计",
    });
  }

  // Active users in range: based on LastActivityDate
  const usersRes = await embyFetchUsers(server.baseUrl, apiKey);
  let activeUsers = 0;
  if (usersRes.ok) {
    activeUsers = (usersRes.users ?? []).filter((u: any) => {
      const last = u?.LastActivityDate;
      if (!last) return false;
      const d = new Date(last);
      if (Number.isNaN(d.getTime())) return false;
      return d >= since;
    }).length;
  }

  // Top played items in range (best-effort via PlayCount + LastPlayedDate/DateLastPlayed)
  const [moviesRes, episodesRes] = await Promise.all([
    embyFetchTopPlayedItems({ baseUrl: server.baseUrl, apiKey, includeItemTypes: ["Movie"], limit: 20, since }),
    embyFetchTopPlayedItems({ baseUrl: server.baseUrl, apiKey, includeItemTypes: ["Episode"], limit: 50, since }),
  ]);

  const topMovies = moviesRes.ok
    ? moviesRes.items.slice(0, 10).map((it: any) => ({
        id: String(it?.Id ?? ""),
        name: String(it?.Name ?? ""),
        playCount: it?.UserData?.PlayCount ?? it?.PlayCount ?? null,
        lastPlayed: it?.UserData?.LastPlayedDate ?? it?.DateLastPlayed ?? null,
        year: it?.ProductionYear ?? null,
      }))
    : [];

  const topEpisodes = episodesRes.ok
    ? episodesRes.items.slice(0, 15).map((it: any) => ({
        id: String(it?.Id ?? ""),
        seriesName: String(it?.SeriesName ?? ""),
        name: String(it?.Name ?? ""),
        season: it?.ParentIndexNumber ?? null,
        episode: it?.IndexNumber ?? null,
        playCount: it?.UserData?.PlayCount ?? it?.PlayCount ?? null,
        lastPlayed: it?.UserData?.LastPlayedDate ?? it?.DateLastPlayed ?? null,
      }))
    : [];

  return NextResponse.json({
    ok: true,
    server: { id: server.id, name: server.name, baseUrl: server.baseUrl },
    rangeDays,
    pluginInstalled: true,
    requirePlugin: false,
    activeUsers,
    topMovies,
    topEpisodes,
    warn: {
      users: usersRes.ok ? null : { status: usersRes.status, body: usersRes.body },
      movies: moviesRes.ok ? null : { status: moviesRes.status, body: moviesRes.body },
      episodes: episodesRes.ok ? null : { status: episodesRes.status, body: episodesRes.body },
    },
  });
}
