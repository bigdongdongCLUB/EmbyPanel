export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pickServerForPlan } from "@/lib/plan-assign";
import { getSyncPassword } from "@/lib/user-secrets";
import { embyFetchUsers } from "@/lib/emby";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyApplyTemplatePolicy, embyCreateUser, embySetUserDisabled, embySetUserPassword } from "@/lib/emby-provision";
import { autoCancelExpiredPendingOrders, isOrderPendingExpired } from "@/lib/order-expiry";

const INVITE_REBATE_KEY = "invite_rebate";
const INVITE_REL_KEY = "invite_relations";
const INVITE_FIRST_PAID_KEY = "invite_rebate_first_paid";
const PENALTY_STATE_KEY = "anomaly_penalty_state";
const PENALTY_RECORDS_KEY = "anomaly_penalty_records";

function stateKey(serverId: string, userId: string) {
  return `${serverId}:${userId}`;
}

async function applyInviteCommission(tx: any, buyerUserId: string, amountCents: number) {
  if (!amountCents || amountCents <= 0) return;

  const [rebateRow, relRow] = await Promise.all([
    tx.appSetting.findUnique({ where: { key: INVITE_REBATE_KEY } }),
    tx.appSetting.findUnique({ where: { key: INVITE_REL_KEY } }),
  ]);

  const rebate = (rebateRow?.valueJson as any) ?? {};
  if (!rebate?.enabled) return;

  const relMap = ((relRow?.valueJson as any) ?? {}) as Record<string, { inviterUserId: string }>;
  const inviterUserId = relMap[buyerUserId]?.inviterUserId;
  if (!inviterUserId || inviterUserId === buyerUserId) return;

  const rate1 = Number(rebate?.rate1 ?? 0);
  if (!Number.isFinite(rate1) || rate1 <= 0) return;

  const mode = rebate?.mode === "FIRST_ONLY" ? "FIRST_ONLY" : "LOOP";
  if (mode === "FIRST_ONLY") {
    const firstPaidRow = await tx.appSetting.findUnique({ where: { key: INVITE_FIRST_PAID_KEY } });
    const paidMap = ((firstPaidRow?.valueJson as any) ?? {}) as Record<string, boolean>;
    if (paidMap[buyerUserId]) return;

    paidMap[buyerUserId] = true;
    await tx.appSetting.upsert({
      where: { key: INVITE_FIRST_PAID_KEY },
      create: { key: INVITE_FIRST_PAID_KEY, valueJson: paidMap },
      update: { valueJson: paidMap },
    });
  }

  const commissionCents = Math.floor((amountCents * rate1) / 100);
  if (commissionCents <= 0) return;

  await tx.user.update({ where: { id: inviterUserId }, data: { balanceCents: { increment: commissionCents } } });

  const recKey = "invite_rebate_records";
  const recRow = await tx.appSetting.findUnique({ where: { key: recKey } });
  const records = Array.isArray(recRow?.valueJson) ? ([...(recRow!.valueJson as any[])] as any[]) : [];
  records.push({
    id: crypto.randomUUID(),
    inviterUserId,
    invitedUserId: buyerUserId,
    level: 1,
    rate: rate1,
    orderAmountCents: amountCents,
    rebateAmountCents: commissionCents,
    createdAt: new Date().toISOString(),
    source: "ORDER_PAY",
  });
  if (records.length > 5000) records.splice(0, records.length - 5000);

  await tx.appSetting.upsert({
    where: { key: recKey },
    create: { key: recKey, valueJson: records },
    update: { valueJson: records },
  });
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const { id } = await ctx.params;
  await autoCancelExpiredPendingOrders(prisma, { id, userId: user.id });

  let paidOrder: { id: string; planId: string; activeSubId: string; preferredServerIds?: string[] };
  try {
    paidOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({ where: { id, userId: user.id } });
      if (!order) throw new Error("order_not_found");
      if (order.status === "PENDING" && isOrderPendingExpired(order.createdAt)) {
        await tx.serviceOrder.update({ where: { id: order.id }, data: { status: "CANCELED", canceledAt: new Date() } });
        throw new Error("order_expired");
      }
      if (order.status !== "PENDING") throw new Error("order_not_pending");

      const me = await tx.user.findUnique({ where: { id: user.id }, select: { balanceCents: true } });
      if (!me) throw new Error("user_not_found");
      if ((me.balanceCents ?? 0) < order.amountCents) throw new Error("insufficient_balance");

      await tx.user.update({ where: { id: user.id }, data: { balanceCents: { decrement: order.amountCents } } });

      const now = new Date();
      const durationMs = order.payCycle === "TRIAL"
        ? ((order.trialHours ?? order.days * 24) * 3600 * 1000)
        : (order.days * 24 * 3600 * 1000);

      // 已有订阅计划（无论是否到期）：仅延长时长，不更换 planId
      const existingPlanSub = await tx.subscription.findFirst({
        where: { userId: user.id, planId: { not: null }, status: { in: ["ACTIVE", "EXPIRED"] } },
        orderBy: { endAt: "desc" },
        select: { id: true, planId: true, payCycle: true, startAt: true, endAt: true, servers: { select: { embyServerId: true } } },
      });

      let activeSubId = "";
      let effectivePlanId = order.planId;
      let preferredServerIds: string[] = [];

      if (existingPlanSub?.planId) {
        const base = existingPlanSub.endAt.getTime() > now.getTime() ? existingPlanSub.endAt : now;
        const newEnd = new Date(base.getTime() + durationMs);
        await tx.subscription.update({
          where: { id: existingPlanSub.id },
          data: {
            payCycle: existingPlanSub.payCycle ?? order.payCycle,
            startAt: existingPlanSub.endAt.getTime() > now.getTime() ? existingPlanSub.startAt : now,
            endAt: newEnd,
            status: "ACTIVE",
          },
        });
        activeSubId = existingPlanSub.id;
        effectivePlanId = existingPlanSub.planId;
        preferredServerIds = (existingPlanSub.servers ?? []).map((s) => s.embyServerId);
      } else {
        const active = await tx.subscription.findFirst({
          where: { userId: user.id, status: "ACTIVE" },
          orderBy: { endAt: "desc" },
          select: { id: true, startAt: true, endAt: true },
        });

        if (!active) {
          const endAt = new Date(now.getTime() + durationMs);
          const created = await tx.subscription.create({
            data: {
              userId: user.id,
              planId: order.planId,
              status: "ACTIVE",
              payCycle: order.payCycle,
              startAt: now,
              endAt,
            },
            select: { id: true },
          });
          activeSubId = created.id;
        } else {
          const base = active.endAt.getTime() > now.getTime() ? active.endAt : now;
          const newEnd = new Date(base.getTime() + durationMs);
          await tx.subscription.update({
            where: { id: active.id },
            data: {
              planId: order.planId,
              payCycle: order.payCycle,
              startAt: active.endAt.getTime() > now.getTime() ? active.startAt : now,
              endAt: newEnd,
              status: "ACTIVE",
            },
          });
          activeSubId = active.id;
        }
      }

      await tx.serviceOrder.update({ where: { id: order.id }, data: { status: "PAID", paidAt: now } });

      await applyInviteCommission(tx, user.id, order.amountCents ?? 0);

      return { id: order.id, planId: effectivePlanId, activeSubId, preferredServerIds };
    });

    // 支付后同步分配 Emby 服务器与账号（best-effort）
    try {
      const u = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, username: true, syncPasswordEnc: true, syncPasswordIv: true, syncPasswordTag: true } });
      const preferredServerIds = Array.isArray(paidOrder.preferredServerIds) ? paidOrder.preferredServerIds.filter(Boolean) : [];
      const picked = preferredServerIds.length
        ? { strategy: "KEEP_EXISTING" as const, servers: preferredServerIds.map((embyServerId) => ({ embyServerId, templateEmbyUserId: "" })) }
        : await pickServerForPlan(paidOrder.planId);

      if (!u) return NextResponse.json({ ok: true, warn: "user_not_found_after_paid" });

      const pw = getSyncPassword(u);
      if (!pw) return NextResponse.json({ ok: true, warn: "missing_sync_password" });

      const [servers, serverConfigs] = await Promise.all([
        prisma.embyServer.findMany({
          where: { id: { in: picked.servers.map((x) => x.embyServerId) } },
          select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
        }),
        prisma.planServerConfig.findMany({ where: { planId: paidOrder.planId }, select: { embyServerId: true, templateEmbyUserId: true } }),
      ]);

      const templateByServerId = new Map(serverConfigs.map((c) => [c.embyServerId, c.templateEmbyUserId] as const));
      const reenabledServerIds: string[] = [];

      for (const s of servers) {
        const apiKey = getEmbyApiKeyForServer(s);

        let embyUserId: string | null = null;
        const usersRes = await embyFetchUsers(s.baseUrl, apiKey);
        if (usersRes.ok) {
          const found = usersRes.users.find((x: any) => String(x?.Name ?? "").toLowerCase() === u.username.toLowerCase());
          if (found?.Id) embyUserId = String(found.Id);
        }

        if (!embyUserId) {
          const created = await embyCreateUser(s.baseUrl, apiKey, u.username);
          if (created.ok) embyUserId = created.userId;
        }
        if (!embyUserId) continue;

        await embySetUserPassword(s.baseUrl, apiKey, embyUserId, pw);
        const templateId = templateByServerId.get(s.id);
        if (templateId) await embyApplyTemplatePolicy(s.baseUrl, apiKey, embyUserId, templateId);
        await embySetUserDisabled(s.baseUrl, apiKey, embyUserId, false);

        await prisma.embyUserLink.upsert({
          where: { userId_embyServerId: { userId: u.id, embyServerId: s.id } },
          update: { embyUserId, disabled: false },
          create: { userId: u.id, embyServerId: s.id, embyUserId, disabled: false },
        });
        reenabledServerIds.push(s.id);
      }

      if (reenabledServerIds.length) {
        const [penaltyStateRow, penaltyRecordsRow] = await Promise.all([
          prisma.appSetting.findUnique({ where: { key: PENALTY_STATE_KEY } }),
          prisma.appSetting.findUnique({ where: { key: PENALTY_RECORDS_KEY } }),
        ]);

        const penaltyState = ((penaltyStateRow?.valueJson as any) ?? {}) as Record<string, any>;
        const penaltyRecords = (Array.isArray(penaltyRecordsRow?.valueJson) ? (penaltyRecordsRow!.valueJson as any[]) : []) as any[];
        const nowIso = new Date().toISOString();
        const serverSet = new Set(reenabledServerIds);
        let penaltyChanged = false;

        for (const rec of penaltyRecords) {
          if (!rec || rec.status !== "PENDING") continue;
          if (String(rec.userId || "") !== u.id) continue;
          if (!serverSet.has(String(rec.embyServerId || ""))) continue;
          rec.status = "UNBANNED_MANUAL";
          rec.unbannedAt = nowIso;
          rec.unbanSource = "ORDER_PAY";
          penaltyChanged = true;
        }

        for (const serverId of reenabledServerIds) {
          const k = stateKey(serverId, u.id);
          if (penaltyState[k]) {
            penaltyState[k] = { ...penaltyState[k], penaltyActive: false, lastUnbanAt: nowIso };
            penaltyChanged = true;
          }
        }

        if (penaltyChanged) {
          await Promise.all([
            prisma.appSetting.upsert({
              where: { key: PENALTY_STATE_KEY },
              create: { key: PENALTY_STATE_KEY, valueJson: penaltyState },
              update: { valueJson: penaltyState },
            }),
            prisma.appSetting.upsert({
              where: { key: PENALTY_RECORDS_KEY },
              create: { key: PENALTY_RECORDS_KEY, valueJson: penaltyRecords },
              update: { valueJson: penaltyRecords },
            }),
          ]);
        }
      }

      await prisma.subscriptionServer.deleteMany({ where: { subscriptionId: paidOrder.activeSubId } });
      if (picked.servers.length) {
        await prisma.subscriptionServer.createMany({
          data: picked.servers.map((x) => ({ subscriptionId: paidOrder.activeSubId, embyServerId: x.embyServerId })),
          skipDuplicates: true,
        });
      }
    } catch (syncErr) {
      console.warn("order_paid_but_sync_failed", { orderId: paidOrder.id, userId: user.id, error: String(syncErr) });
      return NextResponse.json({ ok: true, warn: "order_paid_but_sync_failed" });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
