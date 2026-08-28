export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyDeleteUser, embySetUserDisabled } from "@/lib/emby-provision";

const DEFAULT_MAX_CONCURRENT_PLAYBACKS = 1;

export async function POST(req: Request) {
  const internalSecret = (process.env.INTERNAL_JOBS_SECRET ?? "").trim();
  const headerInternalSecret = (req.headers.get("x-internal-jobs-secret") ?? "").trim();

  if (internalSecret && headerInternalSecret) {
    if (internalSecret !== headerInternalSecret) return NextResponse.json({ error: "invalid_internal_jobs_secret" }, { status: 401 });
  } else {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const startedAt = new Date();
  const job = await prisma.jobRun.create({ data: { jobName: "subscription-expiry-disable", startedAt } });

  try {
    const now = new Date();

    const users = await prisma.user.findMany({
      where: {
        subscriptions: {
          some: {
            status: "ACTIVE",
            endAt: { lte: now },
          },
        },
      },
      select: {
        id: true,
        username: true,
        maxConcurrentPlaybacks: true,
        embyLinks: {
          select: {
            id: true,
            embyUserId: true,
            embyServerId: true,
            disabled: true,
            embyServer: { select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true } },
          },
        },
      },
    });

    let usersScanned = 0;
    let linksDisabled = 0;
    let trialUsersDeleted = 0;
    let vodRequestsCleared = 0;
    let concurrencyResets = 0;
    let skippedLatestStillValid = 0;
    let apiWarnings = 0;

    for (const u of users) {
      usersScanned += 1;

      const latestActive = await prisma.subscription.findFirst({
        where: { userId: u.id, status: "ACTIVE" },
        orderBy: { endAt: "desc" },
        select: { id: true, payCycle: true, endAt: true },
      });
      if (!latestActive || latestActive.endAt > now) {
        skippedLatestStillValid += 1;
        continue;
      }

      // 订阅到期后从用户“我的点播”隐藏全部记录，管理员侧继续保留历史。
      const cleared = await prisma.vodRequest.updateMany({
        where: { userId: u.id, userDeletedAt: null },
        data: { userDeletedAt: now },
      });
      vodRequestsCleared += cleared.count;

      // 规则：试用号到期后直接删除（面板 + Emby）
      if (latestActive.payCycle === "TRIAL") {
        for (const l of u.embyLinks) {
          try {
            const apiKey = getEmbyApiKeyForServer(l.embyServer as any);
            const r = await embyDeleteUser(l.embyServer.baseUrl, apiKey, l.embyUserId);
            if (!r?.ok) apiWarnings += 1;
          } catch {
            apiWarnings += 1;
          }
        }

        await prisma.user.delete({ where: { id: u.id } });
        trialUsersDeleted += 1;
        continue;
      }

      if (u.maxConcurrentPlaybacks !== DEFAULT_MAX_CONCURRENT_PLAYBACKS) {
        await prisma.user.update({
          where: { id: u.id },
          data: { maxConcurrentPlaybacks: DEFAULT_MAX_CONCURRENT_PLAYBACKS, maxConcurrentPlaybacksExpiresAt: null },
        });
        concurrencyResets += 1;
      }

      // 非试用号：维持原逻辑（到期禁用）
      for (const l of u.embyLinks.filter((x) => !x.disabled)) {
        try {
          const apiKey = getEmbyApiKeyForServer(l.embyServer as any);
          const r = await embySetUserDisabled(l.embyServer.baseUrl, apiKey, l.embyUserId, true);
          if (!r?.ok) apiWarnings += 1;
        } catch {
          apiWarnings += 1;
        }

        await prisma.embyUserLink.updateMany({
          where: { id: l.id },
          data: { disabled: true },
        });
        linksDisabled += 1;
      }
    }

    const finishedAt = new Date();
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: true, message: JSON.stringify({ usersScanned, skippedLatestStillValid, linksDisabled, trialUsersDeleted, vodRequestsCleared, concurrencyResets, apiWarnings }) } });
    return NextResponse.json({ ok: true, usersScanned, skippedLatestStillValid, linksDisabled, trialUsersDeleted, vodRequestsCleared, concurrencyResets, apiWarnings, jobRunId: job.id });
  } catch (e: any) {
    const finishedAt = new Date();
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: false, message: String(e?.message ?? e) } });
    return NextResponse.json({ error: "job_failed", message: String(e?.message ?? e), jobRunId: job.id }, { status: 500 });
  }
}
