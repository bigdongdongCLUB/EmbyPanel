export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchSessions, embyStopSessionPlayback } from "@/lib/emby-sessions";
import { embySetAccountPlaybackAccess } from "@/lib/emby-user-policy";

const PENALTY_STATE_KEY = "anomaly_penalty_state";
const PENALTY_RECORDS_KEY = "anomaly_penalty_records";
const PENALTY_CONFIG_KEY = "anomaly_penalty_config";
const PENALTY_STACK_WINDOW_DAYS = 7;
const PENALTY_STACK_MULTIPLIER_MAX = 4;
const PENALTY_DETECTION_WINDOW_MINUTES = 30;
const DEFAULT_MAX_CONCURRENT_PLAYBACKS = 1;

function ipPrefix3(ip?: string) {
  const m = String(ip || "").match(/^(\d+)\.(\d+)\.(\d+)\./);
  if (!m) return "";
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function detectAnomalyTypeFromIps(ips: string[]) {
  const prefixes = Array.from(new Set((ips || []).map(ipPrefix3).filter(Boolean)));
  return prefixes.length >= 2 ? "CROSS_REGION_MULTI_DEVICE" : "SIMULTANEOUS_MULTI_DEVICE";
}

function anomalyTypeLabel(type?: string) {
  return type === "CROSS_REGION_MULTI_DEVICE" ? "异地多设备" : "同时多设备";
}

function normalizeIp(ipRaw: string): string {
  const ip = (ipRaw ?? "").trim();
  if (ip.includes(".") && ip.includes(":")) {
    const firstColon = ip.indexOf(":");
    return ip.slice(0, firstColon);
  }
  return ip;
}

function sessionDeviceKey(s: any) {
  const deviceId = String(s?.DeviceId ?? "").trim().toLowerCase();
  if (deviceId) return `did:${deviceId}`;

  const device = String(s?.DeviceName ?? "").trim().toLowerCase();
  const client = String(s?.Client ?? "").trim().toLowerCase();
  const ip = normalizeIp(String(s?.RemoteEndPoint ?? "")).trim().toLowerCase();

  if (device || client || ip) return `sig:${device}|${client}|${ip}`;
  return `sid:${String(s?.Id ?? "").trim().toLowerCase()}`;
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



async function loadPenaltyConfig() {
  const row = await prisma.appSetting.findUnique({ where: { key: PENALTY_CONFIG_KEY } });
  const v: any = row?.valueJson ?? {};
  const enabled = typeof v?.enabled === "boolean" ? v.enabled : true;
  const d = Number(v?.durationMinutes ?? 5);
  const durationMinutes = Number.isFinite(d) ? Math.max(1, Math.min(120, Math.trunc(d))) : 5;
  return { enabled, durationMinutes };
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

function isAppliedPenaltyRecordInWindow(params: {
  record: any;
  embyServerId?: string;
  userId: string;
  now: Date;
}) {
  const { record, embyServerId, userId, now } = params;
  if (!record || typeof record !== "object") return false;
  if (embyServerId && String(record.embyServerId ?? "") !== embyServerId) return false;
  if (String(record.userId ?? "") !== userId) return false;
  if (String(record.status ?? "") === "FAILED_DISABLE") return false;

  const disabledAtMs = Date.parse(String(record.disabledAt ?? ""));
  if (!Number.isFinite(disabledAtMs)) return false;

  const cutoffMs = now.getTime() - PENALTY_STACK_WINDOW_DAYS * 24 * 3600 * 1000;
  return disabledAtMs >= cutoffMs;
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
    const concurrencyLimitResetResult = await prisma.user.updateMany({
      where: {
        maxConcurrentPlaybacks: { not: DEFAULT_MAX_CONCURRENT_PLAYBACKS },
        OR: [
          { maxConcurrentPlaybacksExpiresAt: null },
          { maxConcurrentPlaybacksExpiresAt: { lte: now } },
          { subscriptions: { none: { status: "ACTIVE", planId: { not: null }, endAt: { gt: now } } } },
        ],
      },
      data: { maxConcurrentPlaybacks: DEFAULT_MAX_CONCURRENT_PLAYBACKS, maxConcurrentPlaybacksExpiresAt: null },
    });
    const penaltyConfig = await loadPenaltyConfig();

    const penaltyState = await loadPenaltyState();
    let penaltyRecords = await loadPenaltyRecords();

    const pendingPenaltyKeys = new Set(
      penaltyRecords
        .filter((r) => r && ["PENDING", "FAILED_UNBAN"].includes(String(r.status ?? "")))
        .map((r) => stateKey(String(r.embyServerId ?? ""), String(r.userId ?? "")))
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
        select: { id: true, disabled: true, userId: true, embyUserId: true, user: { select: { id: true, username: true, maxConcurrentPlaybacks: true, maxConcurrentPlaybacksExpiresAt: true } } },
      });
      const linkMap = new Map<string, { id: string; disabled: boolean; userId: string; username: string; maxConcurrentPlaybacks: number }>();
      for (const l of links) {
        const expiredLimit = l.user.maxConcurrentPlaybacks !== DEFAULT_MAX_CONCURRENT_PLAYBACKS && (!l.user.maxConcurrentPlaybacksExpiresAt || l.user.maxConcurrentPlaybacksExpiresAt <= now);
        const raw = Number(expiredLimit ? DEFAULT_MAX_CONCURRENT_PLAYBACKS : l.user.maxConcurrentPlaybacks ?? DEFAULT_MAX_CONCURRENT_PLAYBACKS);
        const maxConcurrentPlaybacks = Number.isFinite(raw) ? Math.max(0, Math.min(10, Math.trunc(raw))) : DEFAULT_MAX_CONCURRENT_PLAYBACKS;
        linkMap.set(l.embyUserId, { id: l.id, disabled: !!l.disabled, userId: l.user.id, username: l.user.username, maxConcurrentPlaybacks });
      }

      for (const [embyUserId, sessions] of byUser.entries()) {
        const link = linkMap.get(embyUserId);
        if (!link) {
          skippedOrphanSessions += sessions.length;
          continue;
        }

        // 去重同设备会话：优先按 DeviceId，其次按 设备名+客户端+IP 组合。
        // 这可以避免同一设备异常退出后短时重连，旧会话尚未回收导致的误判。
        const uniqueByDevice = new Map<string, any>();
        for (const s of sessions) {
          uniqueByDevice.set(sessionDeviceKey(s), s);
        }
        const uniqueSessions = Array.from(uniqueByDevice.values());
        const concurrentCount = uniqueSessions.length;

        // 0 means unlimited concurrent playbacks, never considered anomaly.
        if (link.maxConcurrentPlaybacks === 0) continue;
        if (concurrentCount <= link.maxConcurrentPlaybacks) continue;

        const key = stateKey(server.id, link.userId);
        detectedKeys.add(key);

        const prev = penaltyState[key] ?? { detectionTimes: [], penaltyActive: false };
        const detectionTimes: string[] = Array.isArray(prev.detectionTimes) ? prev.detectionTimes : [];
        const cutoffMs = now.getTime() - PENALTY_DETECTION_WINDOW_MINUTES * 60 * 1000;
        const recentDetections = detectionTimes.filter((t: string) => Date.parse(t) >= cutoffMs);
        recentDetections.push(now.toISOString());
        penaltyState[key] = {
          ...prev,
          detectionTimes: recentDetections,
          lastDetectedAt: now.toISOString(),
          penaltyActive: pendingPenaltyKeys.has(key),
        };

        const sessionRows = uniqueSessions.map((s: any) => ({
          device: String(s?.DeviceName ?? ""),
          client: String(s?.Client ?? ""),
          ip: normalizeIp(String(s?.RemoteEndPoint ?? "")),
          nowPlaying: nowPlayingLabel(s),
        }));

        const ips = Array.from(new Set(sessionRows.map((x) => x.ip).filter(Boolean)));
        const anomalyType = detectAnomalyTypeFromIps(ips);
        const titles = Array.from(new Set(sessionRows.map((x) => x.nowPlaying).filter(Boolean)));
        const devices = Array.from(new Set(sessionRows.map((x) => x.device).filter(Boolean)));
        const description = titles.length >= 2 ? `同时在 ${concurrentCount} 个设备上播放不同内容` : `同一时间检测到 ${concurrentCount} 个设备播放`;
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
              anomalyType,
              anomalyTypeLabel: anomalyTypeLabel(anomalyType),
              maxConcurrentPlaybacks: link.maxConcurrentPlaybacks,
              sessionCount: concurrentCount,
              rawSessionCount: sessions.length,
              ips,
              titles,
              description: `${description}（允许同播 ${link.maxConcurrentPlaybacks} 台）`,
              excerpt,
              sessions: sessionRows,
            },
          },
        });
        createdEvents += 1;

        if (penaltyConfig.enabled && recentDetections.length >= 2 && !pendingPenaltyKeys.has(key)) {
          const recentAppliedPenaltyCount = penaltyRecords.filter((r) =>
            isAppliedPenaltyRecordInWindow({
              record: r,
              embyServerId: server.id,
              userId: link.userId,
              now,
            })
          ).length;
          const recentUserPenaltyCount = penaltyRecords.filter((r) =>
            isAppliedPenaltyRecordInWindow({ record: r, userId: link.userId, now })
          ).length;
          const penaltySequence = recentUserPenaltyCount + 1;
          const penaltyMultiplier = Math.max(1, Math.min(PENALTY_STACK_MULTIPLIER_MAX, recentAppliedPenaltyCount + 1));
          const penaltyMinutes = penaltyConfig.durationMinutes * penaltyMultiplier;
          const unlockAt = new Date(now.getTime() + penaltyMinutes * 60 * 1000);
          const recId = `penalty_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          let accountBlockedOk = false;
          let accountBlockError: string | null = null;
          let previousIsDisabled = false;
          let previousEnableMediaPlayback = true;

          // Stop active streams, disable the account, and block new playback.
          // Authentication tokens and non-playing sessions remain untouched.
          const playingSessionIds = sessions.map((s: any) => String(s?.Id ?? "").trim()).filter(Boolean);
          let stoppedSessions = 0;
          const stopErrors: string[] = [];
          for (const sid of playingSessionIds) {
            try {
              const sr = await embyStopSessionPlayback(server.baseUrl, apiKey, sid);
              if (sr.ok) stoppedSessions += 1;
              else stopErrors.push(`${sid}: ${sr.body || `HTTP ${sr.status}`}`);
            } catch (e: any) {
              stopErrors.push(`${sid}: ${String(e?.message ?? e)}`);
            }
          }

          try {
            const r = await embySetAccountPlaybackAccess(server.baseUrl, apiKey, embyUserId, {
              disabled: true,
              mediaPlaybackEnabled: false,
            });
            if (r.ok) {
              accountBlockedOk = true;
              previousIsDisabled = r.previousIsDisabled;
              previousEnableMediaPlayback = r.previousEnableMediaPlayback;
            } else {
              accountBlockError = String(r.body || `HTTP ${r.status || "?"}`);
            }
          } catch (e: any) {
            accountBlockError = String(e?.message ?? e);
          }

          if (accountBlockedOk) {
            await prisma.embyUserLink.updateMany({ where: { id: link.id }, data: { disabled: true } });
            penaltiesApplied += 1;
            pendingPenaltyKeys.add(key);
            penaltyState[key] = {
              ...penaltyState[key],
              detectionTimes: [],
              consecutive: 0,
              penaltyActive: true,
              lastPenaltyAt: now.toISOString(),
            };
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
              baseDurationMinutes: penaltyConfig.durationMinutes,
              penaltySequence,
              penaltyMultiplier,
              penaltyDurationMinutes: penaltyMinutes,
              stackWindowDays: PENALTY_STACK_WINDOW_DAYS,
              penaltyMode: "ACCOUNT_AND_MEDIA_PLAYBACK",
              previousIsDisabled,
              previousEnableMediaPlayback,
              stoppedSessions,
              anomalyType,
              anomalyTypeLabel: anomalyTypeLabel(anomalyType),
              stopErrors: stopErrors.length ? stopErrors.slice(0, 5) : undefined,
              reason: `30 分钟内累计 2 次检测命中异常并发播放，按1周内第${penaltyMultiplier}次处罚封禁${penaltyMinutes}分钟（基础${penaltyConfig.durationMinutes}分钟，倍率x${penaltyMultiplier}）`,
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
              baseDurationMinutes: penaltyConfig.durationMinutes,
              penaltySequence,
              penaltyMultiplier,
              penaltyDurationMinutes: penaltyMinutes,
              stackWindowDays: PENALTY_STACK_WINDOW_DAYS,
              penaltyMode: "ACCOUNT_AND_MEDIA_PLAYBACK",
              anomalyType,
              anomalyTypeLabel: anomalyTypeLabel(anomalyType),
              stoppedSessions,
              stopErrors: stopErrors.length ? stopErrors.slice(0, 5) : undefined,
              error: accountBlockError || "block_account_and_media_playback_failed",
              reason: `30 分钟内累计 2 次检测命中异常并发播放，计划按x${penaltyMultiplier}封禁${penaltyMinutes}分钟，但账号禁用或播放权限关闭失败`,
            });
          }
        }
      }
    }

    for (const k of Object.keys(penaltyState)) {
      const prev = penaltyState[k] ?? {};
      const detectionTimes: string[] = Array.isArray(prev.detectionTimes) ? prev.detectionTimes : [];
      const cutoffMs = now.getTime() - PENALTY_DETECTION_WINDOW_MINUTES * 60 * 1000;
      const recentDetections = detectionTimes.filter((t: string) => Date.parse(t) >= cutoffMs);
      
      if (!detectedKeys.has(k)) {
        penaltyState[k] = {
          ...prev,
          detectionTimes: recentDetections,
          penaltyActive: pendingPenaltyKeys.has(k),
        };
      }
      
      const v = penaltyState[k] ?? {};
      if (!v.penaltyActive && (!v.detectionTimes || !Array.isArray(v.detectionTimes) || v.detectionTimes.length === 0)) {
        delete penaltyState[k];
      }
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
        message: JSON.stringify({ warnings, scannedSessions, createdEvents, skippedOrphanSessions, penaltiesApplied, concurrencyLimitResets: concurrencyLimitResetResult.count }),
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
      concurrencyLimitResets: concurrencyLimitResetResult.count,
      penaltyEnabled: penaltyConfig.enabled,
      penaltyDurationMinutes: penaltyConfig.durationMinutes,
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
