import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSyncPassword } from "@/lib/user-secrets";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { hasUnresolvedPlaybackPenalty } from "@/lib/payment-penalty";

type Diagnostic = { stage: string; status?: number; serverId?: string; detail?: string; issues?: Diagnostic[] };
export class RedemptionSyncError extends Error {
  constructor(public diagnostic: Diagnostic) { super(diagnostic.stage); }
}

export function safeSyncDetail(value: string, secrets: string[]) {
  let result = value;
  for (const secret of secrets.filter(Boolean)) {
    for (const representation of [secret, JSON.stringify(secret).slice(1, -1), encodeURIComponent(secret)]) {
      result = result.split(representation).join("[REDACTED]");
    }
  }
  return result.replace(/https?:\/\/[^\s"<>]+/gi, "[URL]")
    .replace(/(?:api_key|token|password|newpw|currentpw)["\s:=]+[^\s&,}"<]+/gi, "[REDACTED]")
    .replace(/[A-Za-z0-9_+/=-]{24,}/g, "[REDACTED]").slice(0, 300);
}

export function redemptionRetryDelay(attempt: number) {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.min(Math.max(attempt - 1, 0), 6));
}

// Enqueue in the redemption transaction: a committed card always has a durable sync job.
export async function enqueueRedemptionSync(tx: Prisma.TransactionClient, subscriptionId: string) {
  return tx.redemptionSyncJob.upsert({ where: { subscriptionId },
    create: { subscriptionId }, update: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: Prisma.DbNull },
  });
}

type RemoteUser = { Id: string; Name: string; Policy?: Record<string, unknown> };
export async function syncRedeemedSubscription(jobId: string, db: PrismaClient = prisma) {
  try {
    return await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "RedemptionSyncJob" WHERE id = ${jobId} AND status = 'PENDING' AND "nextAttemptAt" <= ${new Date()} FOR UPDATE SKIP LOCKED`;
      if (!locked.length) return false;
      const job = await tx.redemptionSyncJob.findUniqueOrThrow({ where: { id: jobId } });
      const sub = await tx.subscription.findUniqueOrThrow({ where: { id: job.subscriptionId }, include: { user: true, servers: true, plan: { include: { serverConfigs: { include: { embyServer: true } } } } } });
      const userLock = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtextextended(${"fulfillment:" + sub.userId}, 0)) AS locked`;
      if (!userLock[0]?.locked) return false;
      if (!sub.user.enabled || sub.status !== "ACTIVE" || sub.endAt <= new Date() || !sub.plan) {
        await tx.redemptionSyncJob.update({ where: { id: jobId }, data: { status: "CANCELED", lastError: { stage: "subscription_not_eligible" } } });
        return false;
      }
      const attempt = job.attempts + 1;
      let context: Diagnostic = { stage: "prepare" };
      try {
        const password = getSyncPassword(sub.user);
        if (!password) throw new RedemptionSyncError({ stage: "missing_sync_password" });
        const configs = sub.plan.serverConfigs;
        const request = async <T>(server: typeof configs[number]["embyServer"], stage: string, path: string, method = "GET", body?: unknown): Promise<T> => {
          context = { stage, serverId: server.id };
          const apiKey = getEmbyApiKeyForServer(server);
          let response: Response;
          try {
            response = await fetch(server.baseUrl.trim().replace(/\/+$/, "") + path, {
              method, headers: { "X-Emby-Token": apiKey, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000), cache: "no-store",
            });
            const text = await response.text();
            if (!response.ok) throw new RedemptionSyncError({ ...context, status: response.status, detail: safeSyncDetail(text, [apiKey, password]) });
            return (text ? JSON.parse(text) : null) as T;
          } catch (error) {
            if (error instanceof RedemptionSyncError) throw error;
            throw new RedemptionSyncError({ ...context, detail: error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "request_timeout" : "network_or_invalid_response" });
          }
        };
        let serverIds = sub.servers.map((s) => s.embyServerId);
        if (!serverIds.length) {
          const enabled = configs.filter((c) => c.embyServer.enabled);
          if (!enabled.length) throw new RedemptionSyncError({ stage: "no_enabled_servers" });
          if (sub.plan.serverAssignStrategy === "ALL") serverIds = enabled.map((c) => c.embyServerId);
          else {
            const scores: Array<{ id: string; count: number }> = [];
            for (const config of enabled) {
              try { scores.push({ id: config.embyServerId, count: (await request<RemoteUser[]>(config.embyServer, "select_server", "/Users")).length }); }
              catch (error) { console.warn("redemption_sync_server_probe_failed", { jobId, ...(error as RedemptionSyncError).diagnostic }); }
            }
            if (!scores.length) throw new RedemptionSyncError({ stage: "all_servers_unreachable" });
            scores.sort((a, b) => a.count - b.count);
            serverIds = [scores[0].id];
          }
          // Commit the assignment before remote creation, including if this attempt later fails.
          await db.subscriptionServer.createMany({ data: serverIds.map((embyServerId) => ({ subscriptionId: sub.id, embyServerId })), skipDuplicates: true });
        }
        const servers = await tx.embyServer.findMany({ where: { id: { in: serverIds } } });
        if (servers.length !== serverIds.length) throw new RedemptionSyncError({ stage: "assigned_server_missing" });
        const issues: Diagnostic[] = [];
        for (const server of servers) {
          try {
            context = { serverId: server.id, stage: "check_server" };
            if (!server.enabled) throw new RedemptionSyncError({ ...context, stage: "assigned_server_disabled" });
            const penalty = await tx.appSetting.findMany({ where: { key: { in: ["anomaly_penalty_state", "anomaly_penalty_records"] } } });
            if (hasUnresolvedPlaybackPenalty(penalty, server.id, sub.userId)) throw new RedemptionSyncError({ ...context, stage: "penalty_active" });
            const users = await request<RemoteUser[]>(server, "find_user", "/Users");
            let remote = users.find((u) => u.Name.toLowerCase() === sub.user.username.toLowerCase());
            if (!remote) {
              try { remote = await request<RemoteUser>(server, "create_user", "/Users/New", "POST", { Name: sub.user.username }); }
              catch (error) {
                // A timed-out create may already have succeeded remotely; never blindly duplicate it.
                remote = (await request<RemoteUser[]>(server, "recheck_created_user", "/Users")).find((u) => u.Name.toLowerCase() === sub.user.username.toLowerCase());
                if (!remote) throw error;
              }
            }
            if (!remote?.Id) throw new RedemptionSyncError({ ...context, stage: "missing_remote_user_id" });
            if (remote.Policy?.IsAdministrator) throw new RedemptionSyncError({ ...context, stage: "unexpected_admin_account" });
            const path = "/Users/" + encodeURIComponent(remote.Id);
            await request(server, "disable_during_sync", path + "/Policy", "POST", { ...remote.Policy, IsAdministrator: false, IsDisabled: true });
            const templateId = configs.find((c) => c.embyServerId === server.id)?.templateEmbyUserId;
            if (!templateId) throw new RedemptionSyncError({ ...context, stage: "missing_template" });
            const template = await request<RemoteUser>(server, "read_template", "/Users/" + encodeURIComponent(templateId));
            if (!template.Policy) throw new RedemptionSyncError({ ...context, stage: "missing_template_policy" });
            await request(server, "set_password", path + "/Password", "POST", { CurrentPw: "", NewPw: password });
            const current = await tx.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: { user: { select: { enabled: true } } } });
            const latestPenalty = await tx.appSetting.findMany({ where: { key: { in: ["anomaly_penalty_state", "anomaly_penalty_records"] } } });
            if (!current.user.enabled || current.status !== "ACTIVE" || current.endAt <= new Date() || current.planId !== sub.planId || hasUnresolvedPlaybackPenalty(latestPenalty, server.id, sub.userId)) throw new RedemptionSyncError({ ...context, stage: "eligibility_changed" });
            await request(server, "apply_policy", path + "/Policy", "POST", { ...template.Policy, IsAdministrator: false, IsDisabled: false });
            const verified = await request<RemoteUser>(server, "verify_user", path);
            if (verified.Id !== remote.Id || verified.Policy?.IsDisabled !== false) throw new RedemptionSyncError({ ...context, stage: "verification_failed" });
            await tx.embyUserLink.upsert({ where: { userId_embyServerId: { userId: sub.userId, embyServerId: server.id } },
              create: { userId: sub.userId, embyServerId: server.id, embyUserId: remote.Id, disabled: false },
              update: { embyUserId: remote.Id, disabled: false },
            });
          } catch (error) {
            issues.push(error instanceof RedemptionSyncError ? error.diagnostic : { ...context, detail: "internal_sync_error" });
          }
        }
        if (issues.length) throw new RedemptionSyncError({ stage: "server_sync_incomplete", issues });
        await tx.redemptionSyncJob.update({ where: { id: jobId }, data: { status: "DONE", attempts: attempt, lastError: Prisma.DbNull } });
        console.info("redemption_sync_completed", { jobId, userId: sub.userId, subscriptionId: sub.id, attempt });
        return true;
      } catch (error) {
        const diagnostic = error instanceof RedemptionSyncError ? error.diagnostic : { ...context, detail: "internal_sync_error" };
        const nextAttemptAt = new Date(Date.now() + redemptionRetryDelay(attempt));
        await tx.redemptionSyncJob.update({ where: { id: jobId }, data: { attempts: attempt, nextAttemptAt, lastError: diagnostic } });
        console.warn("redemption_sync_retry_scheduled", { jobId, userId: sub.userId, subscriptionId: sub.id, attempt, nextAttemptAt: nextAttemptAt.toISOString(), ...diagnostic });
        return false;
      }
    }, { timeout: 90000, maxWait: 5000 });
  } catch {
    // Transaction timeouts roll back the attempt; keep the durable job retryable.
    const job = await db.redemptionSyncJob.findUnique({ where: { id: jobId } });
    if (job?.status === "PENDING") {
      const nextAttemptAt = new Date(Date.now() + redemptionRetryDelay(job.attempts + 1));
      await db.redemptionSyncJob.updateMany({ where: { id: jobId, status: "PENDING", updatedAt: job.updatedAt }, data: {
        attempts: { increment: 1 }, nextAttemptAt, lastError: { stage: "transaction_interrupted" },
      } });
      console.warn("redemption_sync_transaction_interrupted", { jobId, nextAttemptAt: nextAttemptAt.toISOString() });
    }
    return false;
  }
}
