import { prisma } from "@/lib/db";
import { pickServerForPlan } from "@/lib/plan-assign";
import { getSyncPassword } from "@/lib/user-secrets";
import { embyFetchUsers } from "@/lib/emby";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyApplyTemplatePolicy, embyCreateUser, embySetUserDisabled, embySetUserPassword } from "@/lib/emby-provision";
import { hasUnresolvedPlaybackPenalty } from "@/lib/payment-penalty";
import { z } from "zod";
const Fulfillment = z.object({ id: z.string(), planId: z.string(), activeSubId: z.string(), preferredServerIds: z.array(z.string()).optional() });

export async function fulfillPaidOrder(orderId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findUnique({ where: { id: orderId } });
      if (!order || order.status !== "PAID") return false;
      if (order.fulfillmentStatus === "DONE" || order.fulfillmentStatus === "NONE") return true;
      const locks = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtextextended(${"fulfillment:" + order.userId}, 0)) AS locked`;
      if (!locks[0]?.locked) return false;
      const paidOrder = Fulfillment.parse(order.fulfillmentJson);
      const eligible = await tx.user.findFirst({ where: { id: order.userId, enabled: true, subscriptions: { some: { id: paidOrder.activeSubId, status: "ACTIVE", endAt: { gt: new Date() } } } } });
      if (!eligible) throw new Error("fulfillment_user_not_eligible");
      const u = await tx.user.findUnique({ where: { id: order.userId }, select: { id: true, username: true, syncPasswordEnc: true, syncPasswordIv: true, syncPasswordTag: true } });
      const preferredServerIds = Array.isArray(paidOrder.preferredServerIds) ? paidOrder.preferredServerIds.filter(Boolean) : [];
      const picked = preferredServerIds.length
        ? { strategy: "KEEP_EXISTING" as const, servers: preferredServerIds.map((embyServerId) => ({ embyServerId, templateEmbyUserId: "" })) }
        : await pickServerForPlan(paidOrder.planId);

      if (!u) throw new Error("user_not_found_after_paid");

      const pw = getSyncPassword(u);
      if (!pw) throw new Error("missing_sync_password");

      const [servers, serverConfigs] = await Promise.all([
        tx.embyServer.findMany({
          where: { id: { in: picked.servers.map((x) => x.embyServerId) } },
          select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
        }),
        tx.planServerConfig.findMany({ where: { planId: paidOrder.planId }, select: { embyServerId: true, templateEmbyUserId: true } }),
      ]);

      const templateByServerId = new Map(serverConfigs.map((c) => [c.embyServerId, c.templateEmbyUserId] as const));

      // Persist the chosen servers independently so retries do not reassign after a remote failure.
      await prisma.$transaction(async (assignmentTx) => {
        await assignmentTx.subscriptionServer.deleteMany({ where: { subscriptionId: paidOrder.activeSubId } });
        await assignmentTx.subscriptionServer.createMany({
          data: picked.servers.map((x) => ({ subscriptionId: paidOrder.activeSubId, embyServerId: x.embyServerId })),
          skipDuplicates: true,
        });
        await assignmentTx.serviceOrder.update({ where: { id: orderId }, data: {
          fulfillmentJson: { ...paidOrder, preferredServerIds: picked.servers.map((server) => server.embyServerId) },
        } });
      });
      for (const s of servers) {
        const penaltyRows = await tx.appSetting.findMany({ where: { key: { in: ["anomaly_penalty_state", "anomaly_penalty_records"] } } });
        if (hasUnresolvedPlaybackPenalty(penaltyRows, s.id, u.id)) continue;
        const apiKey = getEmbyApiKeyForServer(s);

        let embyUserId: string | null = null;
        const usersRes = await embyFetchUsers(s.baseUrl, apiKey);
        if (usersRes.ok) {
          const found = usersRes.users.find((x) => String(x?.Name ?? "").toLowerCase() === u.username.toLowerCase());
          if (found?.Id) embyUserId = String(found.Id);
        }

        if (!embyUserId) {
          const created = await embyCreateUser(s.baseUrl, apiKey, u.username);
          if (created.ok) embyUserId = created.userId;
        }
        if (!embyUserId) throw new Error("emby_user_create_failed");

        const passwordResult = await embySetUserPassword(s.baseUrl, apiKey, embyUserId, pw);
        if (!passwordResult.ok) throw new Error("emby_password_sync_failed");
        const templateId = templateByServerId.get(s.id);
        if (templateId) {
          const policyResult = await embyApplyTemplatePolicy(s.baseUrl, apiKey, embyUserId, templateId);
          if (!policyResult.ok) throw new Error("emby_policy_sync_failed");
        }
        const enabledResult = await embySetUserDisabled(s.baseUrl, apiKey, embyUserId, false);
        if (!enabledResult.ok) throw new Error("emby_enable_failed");

        await tx.embyUserLink.upsert({
          where: { userId_embyServerId: { userId: u.id, embyServerId: s.id } },
          update: { embyUserId, disabled: false },
          create: { userId: u.id, embyServerId: s.id, embyUserId, disabled: false },
        });
      }

      await tx.serviceOrder.update({ where: { id: orderId }, data: { fulfillmentStatus: "DONE", fulfillmentUpdatedAt: new Date() } });
      return true;
    }, { timeout: 90000, maxWait: 5000 });
  } catch {
    await prisma.serviceOrder.updateMany({ where: { id: orderId, status: "PAID", fulfillmentStatus: { not: "DONE" } }, data: { fulfillmentStatus: "FAILED", fulfillmentUpdatedAt: new Date() } });
    console.warn("order_fulfillment_pending", { orderId });
    return false;
  }
}
