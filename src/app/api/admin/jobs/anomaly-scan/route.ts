export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchSessions } from "@/lib/emby-sessions";

function normalizeIp(ipRaw: string): string {
  const ip = (ipRaw ?? "").trim();
  // common case: "1.2.3.4:12345" (try to drop port)
  if (ip.includes(".") && ip.includes(":")) {
    const firstColon = ip.indexOf(":");
    return ip.slice(0, firstColon);
  }
  return ip;
}

function nowPlayingLabel(s: any): string {
  const item: any = s?.NowPlayingItem;
  if (!item) return "";
  if (item?.SeriesName) {
    const season = item?.ParentIndexNumber ?? "?";
    const ep = item?.IndexNumber ?? "?";
    return `${item.SeriesName} S${season}E${ep}`;
  }
  return String(item?.Name ?? "");
}

export async function POST(req: Request) {
  // Allow either admin session OR job token header for external cron.
  const token = (process.env.EMBYPANEL_JOB_TOKEN ?? "").trim();
  const headerToken = (req.headers.get("x-job-token") ?? "").trim();

  if (token && headerToken) {
    if (token !== headerToken) return NextResponse.json({ error: "invalid_job_token" }, { status: 401 });
  } else {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const startedAt = new Date();
  const job = await prisma.jobRun.create({ data: { jobName: "anomaly-scan", startedAt } });

  try {
    const servers = await prisma.embyServer.findMany({
      where: { enabled: true },
      select: { id: true, name: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
      orderBy: { createdAt: "asc" },
    });

    let warnings = 0;
    let scannedSessions = 0;
    let createdEvents = 0;
    let skippedOrphanSessions = 0;

    for (const server of servers) {
      const apiKey = getEmbyApiKeyForServer(server);
      if (!apiKey) {
        warnings += 1;
        continue;
      }

      const sessionsRes = await embyFetchSessions(server.baseUrl, apiKey);
      if (!sessionsRes.ok) {
        warnings += 1;
        continue;
      }

      const playing = (sessionsRes.sessions ?? []).filter((s: any) => !!s?.NowPlayingItem && !s?.PlayState?.IsPaused);
      scannedSessions += playing.length;

      // Group by Emby UserId
      const byUser = new Map<string, any[]>();
      for (const s of playing) {
        const uid = String(s?.UserId ?? "").trim();
        if (!uid) continue;
        const arr = byUser.get(uid) ?? [];
        arr.push(s);
        byUser.set(uid, arr);
      }

      const embyUserIds = Array.from(byUser.keys());
      if (!embyUserIds.length) continue;

      const links = await prisma.embyUserLink.findMany({
        where: { embyServerId: server.id, embyUserId: { in: embyUserIds } },
        select: { userId: true, embyUserId: true, user: { select: { username: true } } },
      });
      const linkMap = new Map<string, { userId: string; username: string }>();
      for (const l of links) linkMap.set(l.embyUserId, { userId: l.userId, username: l.user.username });

      for (const [embyUserId, sessions] of byUser.entries()) {
        if (sessions.length <= 1) continue;

        const link = linkMap.get(embyUserId);
        if (!link) {
          skippedOrphanSessions += sessions.length;
          continue;
        }

        const sessionRows = sessions.map((s: any) => ({
          device: String(s?.DeviceName ?? ""),
          client: String(s?.Client ?? ""),
          ip: normalizeIp(String(s?.RemoteEndPoint ?? "")),
          nowPlaying: nowPlayingLabel(s),
        }));

        const ips = Array.from(new Set(sessionRows.map((x) => x.ip).filter(Boolean)));
        const titles = Array.from(new Set(sessionRows.map((x) => x.nowPlaying).filter(Boolean)));
        const description = titles.length >= 2 ? `同时在 ${sessions.length} 个设备上播放不同内容` : `同一时间检测到 ${sessions.length} 个设备播放`;

        await prisma.anomaly.create({
          data: {
            type: "MULTI_DEVICE_CONCURRENCY",
            status: "OPEN",
            userId: link.userId,
            embyServerId: server.id,
            evidenceJson: {
              serverName: server.name,
              embyUserId,
              userName: link.username,
              sessionCount: sessions.length,
              ips,
              titles,
              description,
              sessions: sessionRows,
            },
          },
        });
        createdEvents += 1;
      }
    }

    const finishedAt = new Date();
    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        finishedAt,
        ok: true,
        message: JSON.stringify({ warnings, scannedSessions, createdEvents, skippedOrphanSessions }),
      },
    });

    return NextResponse.json({
      ok: true,
      jobRunId: job.id,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      warnings,
      scannedSessions,
      createdEvents,
      skippedOrphanSessions,
    });
  } catch (e: any) {
    const finishedAt = new Date();
    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        finishedAt,
        ok: false,
        message: String(e?.message ?? e),
      },
    });
    return NextResponse.json({ error: "job_failed", message: String(e?.message ?? e), jobRunId: job.id }, { status: 500 });
  }
}
