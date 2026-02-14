export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchSessions } from "@/lib/emby-sessions";
import { embySetUserDisabled } from "@/lib/emby-provision";

const PENALTY_STATE_KEY = "anomaly_penalty_state";
const PENALTY_RECORDS_KEY = "anomaly_penalty_records";

function normalizeIp(ipRaw: string): string {
  const ip = (ipRaw ?? "").trim();
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

function stateKey(serverId: string, userId: string) {
  return `${serverId}:${userId}`;
}

async function loadPenaltyState() {
  const row = await prisma.appSetting.findUnique({ where: { key: PENALTY_STATE_KEY } });
  const v = row?.valueJson;
  if (!v || typeof v !== "object" || Array.isArray(v)) return {} as Record<string, any>;
  return v as Record<string, any>;
}

async function savePenaltyState(state: Record<string, any>) {
  await prisma.appSetting.upsert({
    where: { key: PENALTY_STATE_KEY },
    create: { key: PENALTY_STATE_KEY, valueJson: state },
    update: { valueJson: state },
  });
}

async function loadPenaltyRecords() {
  const row = await prisma.appSetting.findUnique({ where: { key: PENALTY_RECORDS_KEY } });
  return Array.isArray(row?.valueJson) ? (row!.valueJson as any[]) : [];
}

async function savePenaltyRecords(records: any[]) {
  await prisma.appSetting.upsert({
    where: { key: PENALTY_RECORDS_KEY },
    create: { key: PENALTY_RECORDS_KEY, valueJson: records },
    update: { valueJson: records },
  });
}

export async function POST(req: Request) {
  const internalSecret = (process.env.INTERNAL_JOBS_SECRET ?? "").trim();
  const headerInternalSecret = (req.headers.get("x-internal-jobs-secret") ?? "").trim();

  if (internalSecret && headerInternalSecret) {
    if (internalSecret !== headerInternalSecret) return NextResponse.json({ error: "invalid_internal_jobs_secret" }, { status: 401 });
  } else {
    const token = (process.env.EMBYPANEL_JOB_TOKEN ?? "").trim();
    const headerToken = (req.headers.get("x-job-token") ?? "").trim();

    if (token && headerToken) {
      if (token !== headerToken) return NextResponse.json({ error: "invalid_job_token" }, { status: 401 });
    } else {
      const auth = await requireAdmin();
      if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  }

  const startedAt = new Date();
  const retentionCutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  await prisma.anomaly.deleteMany({ where: { type: "MULTI_DEVICE_CONCURRENCY", detectedAt: { lt: retentionCutoff } } });

  const job = await prisma.jobRun.create({ data: { jobName: "anomaly-scan", startedAt } });

  try {
    const servers = await prisma.embyServer.findMany({
      where: { enabled: true },
      select: { id: true, name: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
      orderBy: { createdAt: "asc" },
    });

    const now = new Date();
    const unlockAt = new Date(now.getTime() + 5 * 60 * 1000);

    const penaltyState = await loadPenaltyState();
    let penaltyRecords = await loadPenaltyRecords();

    const pendingPenaltyKeys = new Set(
      penaltyRecords.filter((r) => r && r.status === "PENDING").map((r) => stateKey(String(r.embyServerId ?? ""), String(r.userId ?? "")))
    );

    let warnings = 0;
    let scannedSessions = 0;
    let createdEvents = 0;
    let skippedOrphanSessions = 0;
    let penaltiesApplied = 0;

    const detectedKeys = new Set<string>();

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
        select: { id: true, disabled: true, userId: true, embyUserId: true, user: { select: { id: true, username: true } } },
      });
      const linkMap = new Map<string, { id: string; disabled: boolean; userId: string; username: string }>();
      for (const l of links) linkMap.set(l.embyUserId, { id: l.id, disabled: !!l.disabled, userId: l.user.id, username: l.user.username });

      for (const [embyUserId, sessions] of byUser.entries()) {
        if (sessions.length <= 1) continue;

        const link = linkMap.get(embyUserId);
        if (!link) {
          skippedOrphanSessions += sessions.length;
          continue;
        }

        const key = stateKey(server.id, link.userId);
        detectedKeys.add(key);

        const prev = penaltyState[key] ?? { consecutive: 0, penaltyActive: false };
        const nextConsecutive = Number(prev.consecutive ?? 0) + 1;
        penaltyState[key] = {
          ...prev,
          consecutive: nextConsecutive,
          lastDetectedAt: now.toISOString(),
          penaltyActive: pendingPenaltyKeys.has(key),
        };

        const sessionRows = sessions.map((s: any) => ({
          device: String(s?.DeviceName ?? ""),
          client: String(s?.Client ?? ""),
          ip: normalizeIp(String(s?.RemoteEndPoint ?? "")),
          nowPlaying: nowPlayingLabel(s),
        }));

        const ips = Array.from(new Set(sessionRows.map((x) => x.ip).filter(Boolean)));
        const titles = Array.from(new Set(sessionRows.map((x) => x.nowPlaying).filter(Boolean)));
        const devices = Array.from(new Set(sessionRows.map((x) => x.device).filter(Boolean)));
        const description = titles.length >= 2 ? `同时在 ${sessions.length} 个设备上播放不同内容` : `同一时间检测到 ${sessions.length} 个设备播放`;
        const excerpt = [
          devices.length ? `设备: ${devices.slice(0, 3).join(" / ")}${devices.length > 3 ? ` 等${devices.length}台` : ""}` : "",
          ips.length ? `IP: ${ips.join(", ")}` : "",
          titles.length ? `内容: ${titles.slice(0, 2).join(" / ")}` : "",
        ]
          .filter(Boolean)
          .join(" | ");

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
              excerpt,
              sessions: sessionRows,
            },
          },
        });
        createdEvents += 1;

        if (nextConsecutive >= 2 && !pendingPenaltyKeys.has(key)) {
          const recId = `penalty_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          let disabledOk = false;
          let disableError: string | null = null;

          try {
            const r = await embySetUserDisabled(server.baseUrl, apiKey, embyUserId, true);
            disabledOk = !!r?.ok;
            if (!disabledOk) disableError = String((r as any)?.body || `HTTP ${(r as any)?.status || "?"}`);
          } catch (e: any) {
            disableError = String(e?.message ?? e);
          }

          if (disabledOk) {
            await prisma.embyUserLink.updateMany({ where: { id: link.id }, data: { disabled: true } });
            penaltiesApplied += 1;
            pendingPenaltyKeys.add(key);
            penaltyState[key] = { ...penaltyState[key], consecutive: 0, penaltyActive: true, lastPenaltyAt: now.toISOString() };
            penaltyRecords.push({
              id: recId,
              userId: link.userId,
              username: link.username,
              embyServerId: server.id,
              serverName: server.name,
              embyUserId,
              disabledAt: now.toISOString(),
              unlockAt: unlockAt.toISOString(),
              status: "PENDING",
              reason: "连续两次10分钟检测命中异常并发播放",
            });
          } else {
            warnings += 1;
            penaltyRecords.push({
              id: recId,
              userId: link.userId,
              username: link.username,
              embyServerId: server.id,
              serverName: server.name,
              embyUserId,
              disabledAt: now.toISOString(),
              unlockAt: unlockAt.toISOString(),
              status: "FAILED_DISABLE",
              error: disableError || "disable_failed",
              reason: "连续两次10分钟检测命中异常并发播放",
            });
          }
        }
      }
    }

    for (const k of Object.keys(penaltyState)) {
      if (!detectedKeys.has(k)) {
        const prev = penaltyState[k] ?? {};
        penaltyState[k] = {
          ...prev,
          consecutive: 0,
          penaltyActive: pendingPenaltyKeys.has(k),
        };
      }
      const v = penaltyState[k] ?? {};
      if (!v.penaltyActive && !v.consecutive) delete penaltyState[k];
    }

    const recordsRetentionCutoff = Date.now() - 7 * 24 * 3600 * 1000;
    penaltyRecords = penaltyRecords.filter((r) => {
      const t = Date.parse(String(r?.disabledAt || ""));
      if (!Number.isFinite(t)) return false;
      return t >= recordsRetentionCutoff;
    });

    await Promise.all([savePenaltyState(penaltyState), savePenaltyRecords(penaltyRecords)]);

    const finishedAt = new Date();
    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        finishedAt,
        ok: true,
        message: JSON.stringify({ warnings, scannedSessions, createdEvents, skippedOrphanSessions, penaltiesApplied }),
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
      penaltiesApplied,
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
