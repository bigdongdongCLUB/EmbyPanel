export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchSessions, type EmbySession } from "@/lib/emby-sessions";

type SessionRow = {
  id: string;
  userId: string;
  userName: string;
  device: string;
  client: string;
  ip: string;
  paused: boolean;
  nowPlaying: string;
};

function nowPlayingLabel(s: EmbySession): string {
  const item: any = (s as any)?.NowPlayingItem;
  if (!item) return "";
  if (item?.SeriesName) {
    const season = item?.ParentIndexNumber ?? "?";
    const ep = item?.IndexNumber ?? "?";
    return `${item.SeriesName} S${season}E${ep}`;
  }
  return String(item?.Name ?? "");
}

function normalizeIp(ipRaw: string): string {
  const ip = (ipRaw ?? "").trim();
  // common case: "1.2.3.4:12345" (try to drop port)
  if (ip.includes(".") && ip.includes(":")) {
    const firstColon = ip.indexOf(":");
    return ip.slice(0, firstColon);
  }
  return ip;
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const serverId = (url.searchParams.get("serverId") ?? "").trim();

  const servers = await prisma.embyServer.findMany({
    where: {
      enabled: true,
      ...(serverId ? { id: serverId } : {}),
    },
    select: { id: true, name: true, baseUrl: true, enabled: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
    orderBy: { createdAt: "asc" },
  });

  if (serverId && servers.length === 0) return NextResponse.json({ error: "server_not_found" }, { status: 404 });

  const detectedAt = new Date().toISOString();

  const warnings: any[] = [];
  const allSessions: Array<SessionRow & { serverId: string; serverName: string }> = [];

  await Promise.all(
    servers.map(async (server) => {
      const apiKey = getEmbyApiKeyForServer(server);
      if (!apiKey) {
        warnings.push({ serverId: server.id, serverName: server.name, error: "missing_emby_api_key" });
        return;
      }

      const sessionsRes = await embyFetchSessions(server.baseUrl, apiKey);
      if (!sessionsRes.ok) {
        warnings.push({
          serverId: server.id,
          serverName: server.name,
          error: "fetch_sessions_failed",
          status: sessionsRes.status,
          body: sessionsRes.body,
        });
        return;
      }

      const playing = (sessionsRes.sessions ?? []).filter((s: any) => !!s?.NowPlayingItem && !s?.PlayState?.IsPaused);
      for (const s of playing) {
        allSessions.push({
          serverId: server.id,
          serverName: server.name,
          id: String((s as any)?.Id ?? ""),
          userId: String((s as any)?.UserId ?? ""),
          userName: String((s as any)?.UserName ?? ""),
          device: String((s as any)?.DeviceName ?? ""),
          client: String((s as any)?.Client ?? ""),
          ip: String((s as any)?.RemoteEndPoint ?? ""),
          paused: !!(s as any)?.PlayState?.IsPaused,
          nowPlaying: nowPlayingLabel(s as any),
        });
      }
    })
  );

  // Group by (serverId + userId/userName)
  const groups = new Map<string, Array<typeof allSessions[number]>>();
  for (const s of allSessions) {
    const userKey = s.userId ? `uid:${s.userId}` : `un:${s.userName}`;
    const k = `${s.serverId}::${userKey}`;
    const arr = groups.get(k) ?? [];
    arr.push(s);
    groups.set(k, arr);
  }

  const anomalies: any[] = [];
  let multiDeviceCount = 0;
  let multiIpCount = 0;

  for (const [k, sessions] of groups.entries()) {
    if (sessions.length <= 1) continue;

    const serverId2 = sessions[0].serverId;
    const serverName2 = sessions[0].serverName;
    const userId2 = sessions[0].userId;
    const userName2 = sessions[0].userName;

    const ips = Array.from(new Set(sessions.map((x) => normalizeIp(x.ip)).filter(Boolean)));
    const distinctTitles = Array.from(new Set(sessions.map((x) => x.nowPlaying).filter(Boolean)));

    const type = ips.length >= 2 ? "GEO_SHARE" : "MULTI_DEVICE";
    if (type === "GEO_SHARE") multiIpCount += 1;
    else multiDeviceCount += 1;

    const description =
      type === "GEO_SHARE"
        ? `检测到 ${ips.length} 个不同 IP 地址同时在线`
        : distinctTitles.length >= 2
          ? `同时在 ${sessions.length} 个设备上播放不同内容`
          : `同时在 ${sessions.length} 个设备上播放`;

    anomalies.push({
      key: k,
      server: { id: serverId2, name: serverName2 },
      user: { id: userId2, name: userName2 },
      type,
      sessionCount: sessions.length,
      ips,
      titles: distinctTitles,
      description,
      detectedAt,
      sessions: sessions.map((x) => ({
        id: x.id,
        device: x.device,
        client: x.client,
        ip: normalizeIp(x.ip),
        nowPlaying: x.nowPlaying,
      })),
    });
  }

  anomalies.sort((a, b) => (b.sessionCount ?? 0) - (a.sessionCount ?? 0));

  return NextResponse.json({
    ok: true,
    detectedAt,
    scope: serverId ? "single" : "all",
    summary: {
      total: anomalies.length,
      multiDevice: multiDeviceCount,
      geoShare: multiIpCount,
    },
    anomalies,
    warnings,
  });
}
