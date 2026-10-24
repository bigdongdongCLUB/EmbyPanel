export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueRedemptionSync, syncRedeemedSubscription } from "@/lib/redemption-sync";
import { lockOrderUser } from "@/lib/order-pricing";

const INVITE_REBATE_KEY = "invite_rebate";
const INVITE_REL_KEY = "invite_relations";
const INVITE_FIRST_PAID_KEY = "invite_rebate_first_paid";

async function applyInviteCommission(tx: any, buyerUserId: string, amountCents: number) {
  if (!amountCents || amountCents <= 0) return;

  const [rebateRow, relRow] = await Promise.all([
    tx.appSetting.findUnique({ where: { key: INVITE_REBATE_KEY } }),
    tx.appSetting.findUnique({ where: { key: INVITE_REL_KEY } }),
  ]);

  const rebate = (rebateRow?.valueJson as any) ?? {};
  const rebateEnabled = !!rebate?.enabled;

  const relMap = ((relRow?.valueJson as any) ?? {}) as Record<string, { inviterUserId: string }>;
  const inviterUserId = relMap[buyerUserId]?.inviterUserId;
  if (!inviterUserId || inviterUserId === buyerUserId) return;

  const rate1 = Number(rebate?.rate1 ?? 0);
  const normalizedRate = Number.isFinite(rate1) && rate1 > 0 ? rate1 : 0;

  const mode = rebate?.mode === "FIRST_ONLY" ? "FIRST_ONLY" : "LOOP";
  if (rebateEnabled && mode === "FIRST_ONLY") {
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

  const commissionCents = rebateEnabled && normalizedRate > 0 ? Math.floor((amountCents * normalizedRate) / 100) : 0;
  const recordRate = rebateEnabled ? normalizedRate : 0;

  if (commissionCents > 0) {
    await tx.user.update({ where: { id: inviterUserId }, data: { balanceCents: { increment: commissionCents } } });
  }

  const recKey = "invite_rebate_records";
  const recRow = await tx.appSetting.findUnique({ where: { key: recKey } });
  const records = Array.isArray(recRow?.valueJson) ? ([...(recRow!.valueJson as any[])] as any[]) : [];
  records.push({
    id: crypto.randomUUID(),
    inviterUserId,
    invitedUserId: buyerUserId,
    level: 1,
    rate: recordRate,
    orderAmountCents: amountCents,
    rebateAmountCents: commissionCents,
    createdAt: new Date().toISOString(),
    source: "CARD_REDEEM",
  });
  if (records.length > 5000) records.splice(0, records.length - 5000);

  await tx.appSetting.upsert({
    where: { key: recKey },
    create: { key: recKey, valueJson: records },
    update: { valueJson: records },
  });
}

function getPlanPriceCents(pricingJson: any, payCycle?: string | null): number {
  const keyMap: Record<string, string> = {
    TRIAL: "trial",
    MONTHLY: "monthly",
    QUARTERLY: "quarterly",
    HALF_YEARLY: "halfYearly",
    YEARLY: "yearly",
    TWO_YEARLY: "twoYearly",
  };
  const key = keyMap[String(payCycle || "MONTHLY")] || "monthly";
  const raw = pricingJson?.[key]?.priceCents;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

const BodySchema = z.object({ code: z.string().trim().min(6).max(64) });

function cycleDays(payCycle?: string | null) {
  switch (payCycle) {
    case "TRIAL":
      return 7;
    case "MONTHLY":
      return 30;
    case "QUARTERLY":
      return 90;
    case "HALF_YEARLY":
      return 180;
    case "YEARLY":
      return 365;
    case "TWO_YEARLY":
      return 730;
    default:
      return 30;
  }
}


export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const code = parsed.data.code.toUpperCase();

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockOrderUser(tx, user.id);
      const redeemed = await (async () => {
        const cardModel: any = (tx as any).cardCode;
        const card = cardModel
          ? await cardModel.findUnique({ where: { code } })
          : (await tx.$queryRaw<any[]>`SELECT * FROM "CardCode" WHERE "code"=${code} LIMIT 1`)[0];

        if (!card) throw new Error("card_not_found");
        if (card.status !== "UNUSED") throw new Error("card_not_usable");

        // lock by status update
        let locked = 0;
        if (cardModel) {
          const r = await cardModel.updateMany({
            where: { id: card.id, status: "UNUSED" },
            data: { status: "USED", usedAt: new Date(), usedByUserId: user.id },
          });
          locked = r.count;
        } else {
          const r = await tx.$executeRaw`UPDATE "CardCode" SET "status"='USED'::"CardCodeStatus", "usedAt"=NOW(), "usedByUserId"=${user.id} WHERE "id"=${card.id} AND "status"='UNUSED'::"CardCodeStatus"`;
          locked = Number(r || 0);
        }
        if (!locked) throw new Error("card_already_used");

        if (card.type === "BALANCE") {
          const amount = Number(card.amountCents ?? 0);
          if (amount <= 0) throw new Error("invalid_balance_card");
          await tx.user.update({ where: { id: user.id }, data: { balanceCents: { increment: amount } } });
          return { kind: "BALANCE", amountCents: amount };
        }

        if (card.type === "SUBSCRIPTION") {
          const days = Number(card.subscriptionDays ?? 0) > 0 ? Number(card.subscriptionDays) : cycleDays(card.payCycle);
          const now = new Date();

          let planPriceCents = 0;
          if (card.planId) {
            const plan = await tx.plan.findUnique({ where: { id: card.planId }, select: { pricingJson: true } });
            planPriceCents = getPlanPriceCents((plan as any)?.pricingJson, card.payCycle);
          }
          // 已有订阅计划（无论是否到期）：仅延长时长，不更换 planId
          const existingPlanSub = await tx.subscription.findFirst({
            where: { userId: user.id, planId: { not: null }, status: { in: ["ACTIVE", "EXPIRED"] } },
            orderBy: { endAt: "desc" },
            select: { id: true, planId: true, payCycle: true, startAt: true, endAt: true, servers: { select: { embyServerId: true } } },
          });

          if (existingPlanSub?.planId) {
            const base = existingPlanSub.endAt.getTime() > now.getTime() ? existingPlanSub.endAt : now;
            const newEnd = new Date(base.getTime() + days * 24 * 3600 * 1000);
            await tx.subscription.update({
              where: { id: existingPlanSub.id },
              data: {
                payCycle: existingPlanSub.payCycle ?? card.payCycle ?? "MONTHLY",
                startAt: existingPlanSub.endAt.getTime() > now.getTime() ? existingPlanSub.startAt : now,
                endAt: newEnd,
                status: "ACTIVE",
              },
            });
            await applyInviteCommission(tx, user.id, planPriceCents);
            return {
              kind: "SUBSCRIPTION",
              daysAdded: days,
              endAt: newEnd,
              planId: existingPlanSub.planId,
              subscriptionId: existingPlanSub.id,
              preferredServerIds: (existingPlanSub.servers ?? []).map((x) => x.embyServerId),
            };
          }

          const active = await tx.subscription.findFirst({
            where: { userId: user.id, status: "ACTIVE" },
            orderBy: { endAt: "desc" },
            select: { id: true, startAt: true, endAt: true },
          });

          if (!active) {
            const endAt = new Date(now.getTime() + days * 24 * 3600 * 1000);
            const created = await tx.subscription.create({
              data: {
                userId: user.id,
                planId: card.planId ?? null,
                status: "ACTIVE",
                payCycle: card.payCycle ?? "MONTHLY",
                startAt: now,
                endAt,
              },
              select: { id: true },
            });
            await applyInviteCommission(tx, user.id, planPriceCents);
            return { kind: "SUBSCRIPTION", daysAdded: days, endAt, planId: card.planId ?? null, subscriptionId: created.id, preferredServerIds: [] };
          }

          const base = active.endAt.getTime() > now.getTime() ? active.endAt : now;
          const newEnd = new Date(base.getTime() + days * 24 * 3600 * 1000);
          await tx.subscription.update({
            where: { id: active.id },
            data: {
              planId: card.planId ?? null,
              payCycle: card.payCycle ?? "MONTHLY",
              startAt: active.endAt.getTime() > now.getTime() ? active.startAt : now,
              endAt: newEnd,
              status: "ACTIVE",
            },
          });
          await applyInviteCommission(tx, user.id, planPriceCents);
          return { kind: "SUBSCRIPTION", daysAdded: days, endAt: newEnd, planId: card.planId ?? null, subscriptionId: active.id, preferredServerIds: [] };
        }

        throw new Error("unsupported_card_type");
      })();
      if (redeemed.kind === "SUBSCRIPTION" && redeemed.planId && redeemed.subscriptionId) {
        const job = await enqueueRedemptionSync(tx, redeemed.subscriptionId);
        return { ...redeemed, syncJobId: job.id };
      }
      return { ...redeemed, syncJobId: null };
    });

    if (result.syncJobId) {
      // The durable job remains pending even if this request crashes or times out.
      const synced = await syncRedeemedSubscription(result.syncJobId).catch(() => {
        console.warn("redemption_sync_deferred", { jobId: result.syncJobId, userId: user.id });
        return false;
      });
      if (!synced) return NextResponse.json({ ok: true, result, warn: "redeem_subscription_sync_partial" });
    }
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
