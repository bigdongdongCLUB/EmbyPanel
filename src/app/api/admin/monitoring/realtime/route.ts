export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchSystemInfo } from "@/lib/emby";
import { embyFetchSessions } from "@/lib/emby-sessions";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const serverId = (url.searchParams.get("serverId") ?? "").trim();
  if (!serverId) return NextResponse.json({ error: "missing_serverId" }, { status: 400 });

  const server = await prisma.embyServer.findUnique({
    where: { id: serverId },
    select: { id: true, name: true, baseUrl: true, enabled: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
  });
  if (!server) return NextResponse.json({ error: "server_not_found" }, { status: 404 });

  const apiKey = getEmbyApiKeyForServer(server);
  if (!apiKey) return NextResponse.json({ error: "missing_emby_api_key" }, { status: 400 });

  const started = Date.now();
  const sys = await embyFetchSystemInfo(server.baseUrl, apiKey);
  const latencyMs = Date.now() - started;

  if (!sys.ok) {
    return NextResponse.json({
      ok: true,
      server: { id: server.id, name: server.name, baseUrl: server.baseUrl },
      online: false,
      latencyMs,
      error: sys.body,
      playingCount: 0,
      sessions: [],
    });
  }

  const sessionsRes = await embyFetchSessions(server.baseUrl, apiKey);
  if (!sessionsRes.ok) {
    return NextResponse.json({
      ok: true,
      server: { id: server.id, name: server.name, baseUrl: server.baseUrl },
      online: true,
      latencyMs,
      playingCount: 0,
      sessions: [],
      warn: { error: "fetch_sessions_failed", status: sessionsRes.status, body: sessionsRes.body },
    });
  }

  const sessions = (sessionsRes.sessions ?? []).filter((s: any) => !!s?.NowPlayingItem);
  const playingCount = sessions.filter((s: any) => !s?.PlayState?.IsPaused).length;

  const mapped = sessions.map((s: any) => ({
    id: String(s?.Id ?? ""),
    userName: String(s?.UserName ?? ""),
    device: String(s?.DeviceName ?? ""),
    client: String(s?.Client ?? ""),
    ip: String(s?.RemoteEndPoint ?? ""),
    paused: !!s?.PlayState?.IsPaused,
    nowPlaying:
      s?.NowPlayingItem?.SeriesName
        ? `${s.NowPlayingItem.SeriesName} S${s.NowPlayingItem.ParentIndexNumber ?? "?"}E${s.NowPlayingItem.IndexNumber ?? "?"}`
        : String(s?.NowPlayingItem?.Name ?? ""),
  }));

  return NextResponse.json({
    ok: true,
    server: { id: server.id, name: server.name, baseUrl: server.baseUrl, version: sys.ok ? (sys.json?.Version ?? null) : null },
    online: true,
    latencyMs,
    playingCount,
    sessions: mapped,
  });
}
