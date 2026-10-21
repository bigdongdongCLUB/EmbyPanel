import type { Prisma, ServiceOrder } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertOrderEligibility, lockOrderUser, quoteOrder } from "@/lib/order-pricing";
import { isOrderPendingExpired } from "@/lib/order-expiry";

const INVITE_REBATE_KEY = "invite_rebate";
const INVITE_REL_KEY = "invite_relations";
const INVITE_FIRST_PAID_KEY = "invite_rebate_first_paid";

async function applyInviteCommission(tx: Prisma.TransactionClient, buyerUserId: string, amountCents: number) {
  if (!amountCents || amountCents <= 0) return;

  const [rebateRow, relRow] = await Promise.all([
    tx.appSetting.findUnique({ where: { key: INVITE_REBATE_KEY } }),
    tx.appSetting.findUnique({ where: { key: INVITE_REL_KEY } }),
  ]);

  const rebate = (rebateRow?.valueJson as { enabled?: boolean; rate1?: number; mode?: string } | null) ?? {};
  const rebateEnabled = !!rebate?.enabled;

  const relMap = (relRow?.valueJson ?? {}) as Record<string, { inviterUserId: string }>;
  const inviterUserId = relMap[buyerUserId]?.inviterUserId;
  if (!inviterUserId || inviterUserId === buyerUserId) return;

  const rate1 = Number(rebate?.rate1 ?? 0);
  const normalizedRate = Number.isFinite(rate1) && rate1 > 0 ? rate1 : 0;

  const mode = rebate?.mode === "FIRST_ONLY" ? "FIRST_ONLY" : "LOOP";
  if (rebateEnabled && mode === "FIRST_ONLY") {
    const firstPaidRow = await tx.appSetting.findUnique({ where: { key: INVITE_FIRST_PAID_KEY } });
    const paidMap = (firstPaidRow?.valueJson ?? {}) as Record<string, boolean>;
    if (paidMap[buyerUserId]) return;

    paidMap[buyerUserId] = true;
    await tx.appSetting.upsert({
      where: { key: INVITE_FIRST_PAID_KEY },
      create: { key: INVITE_FIRST_PAID_KEY, valueJson: paidMap },
      update: { valueJson: paidMap },
    });
  }

  const commissionCents = rebateEnabled && normalizedRate > 0 ? Math.floor((amountCents * normalizedRate) / 100) : 0;
  const recordRate = rebateEnabled ? normalizedRate : 0;

  if (commissionCents > 0) {
    await tx.user.update({ where: { id: inviterUserId }, data: { balanceCents: { increment: commissionCents } } });
  }

  const recKey = "invite_rebate_records";
  const recRow = await tx.appSetting.findUnique({ where: { key: recKey } });
  const records = Array.isArray(recRow?.valueJson) ? [...(recRow!.valueJson as Prisma.InputJsonValue[])] : [];
  records.push({
    id: crypto.randomUUID(),
    inviterUserId,
    invitedUserId: buyerUserId,
    level: 1,
    rate: recordRate,
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


export async function lockSettlement(tx: Prisma.TransactionClient, userId: string, orderId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(731025, 1)`;
  await lockOrderUser(tx, userId);
  await tx.$queryRaw`SELECT id FROM "ServiceOrder" WHERE id = ${orderId} AND "userId" = ${userId} FOR UPDATE`;
}
export async function grantPaidOrder(tx: Prisma.TransactionClient, order: ServiceOrder, source: "BALANCE" | "STRIPE") {
      const now = new Date();
      const durationMs = order.payCycle === "TRIAL"
        ? ((order.trialHours ?? order.days * 24) * 3600 * 1000)
        : (order.days * 24 * 3600 * 1000);

      // 已有订阅计划（无论是否到期）：仅延长时长，不更换 planId
      const existingPlanSub = await tx.subscription.findFirst({
        where: { userId: order.userId, planId: { not: null }, status: { in: ["ACTIVE", "EXPIRED"] } },
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
          where: { userId: order.userId, status: "ACTIVE" },
          orderBy: { endAt: "desc" },
          select: { id: true, startAt: true, endAt: true },
        });

        if (!active) {
          const endAt = new Date(now.getTime() + durationMs);
          const created = await tx.subscription.create({
            data: {
              userId: order.userId,
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


  await applyInviteCommission(tx, order.userId, order.amountCents);
  const result = { id: order.id, planId: effectivePlanId, activeSubId, preferredServerIds };
  await tx.serviceOrder.update({ where: { id: order.id }, data: {
    status: "PAID", paidAt: now, paymentSource: source,
    fulfillmentStatus: "PENDING", fulfillmentJson: result, fulfillmentUpdatedAt: now,
  } });
  return result;

}
export async function payBalanceOrder(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await lockSettlement(tx, userId, id);
    const order = await tx.serviceOrder.findFirst({ where: { id, userId }, include: { stripePayment: true, plan: true } });
    if (!order) throw new Error("order_not_found");
    if (order.status === "PAID") return { alreadyPaid: true };
    if (order.status !== "PENDING" || isOrderPendingExpired(order.createdAt)) throw new Error("order_not_pending");
    if (order.stripePayment && !["FAILED", "EXPIRED"].includes(order.stripePayment.state)) throw new Error("stripe_payment_in_progress");
    if (!order.plan.enabled || !order.plan.visible) throw new Error("plan_not_available");
    const quote = quoteOrder(order.plan.pricingJson, order.payCycle);
    if (order.amountCents !== quote.amountCents || order.days !== quote.days || order.trialHours !== quote.trialHours) throw new Error("order_price_changed_recreate");
    await assertOrderEligibility(tx, userId, order.planId, order.payCycle === "TRIAL");
    const debit = await tx.user.updateMany({ where: { id: userId, enabled: true, balanceCents: { gte: order.amountCents } }, data: { balanceCents: { decrement: order.amountCents } } });
    if (debit.count !== 1) throw new Error("insufficient_balance");
    await grantPaidOrder(tx, order, "BALANCE");
    return { alreadyPaid: false };
  });
}
