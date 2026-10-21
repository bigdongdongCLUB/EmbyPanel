import type { Prisma, PayCycle } from "@prisma/client";

const cycles = {
  MONTHLY: ["monthly", 30], QUARTERLY: ["quarterly", 90],
  HALF_YEARLY: ["halfYearly", 180], YEARLY: ["yearly", 365], TWO_YEARLY: ["twoYearly", 730],
} as const;

export function quoteOrder(pricing: unknown, cycle: PayCycle) {
  const prices = pricing as Record<string, { priceCents?: number; hours?: number; days?: number }> | null;
  const config = cycle === "TRIAL" ? prices?.trial : prices?.[cycles[cycle][0]];
  const amountCents = config?.priceCents;
  if (!Number.isSafeInteger(amountCents) || amountCents! < 0 || amountCents! > 2147483647) {
    throw new Error("plan_cycle_not_available");
  }
  const trialHours = cycle === "TRIAL" ? (config?.hours ?? (config?.days ?? 0) * 24) : null;
  if (trialHours !== null && (!Number.isInteger(trialHours) || trialHours < 1 || trialHours > 168)) {
    throw new Error("trial_hours_invalid");
  }
  return { amountCents: amountCents!, trialHours, days: trialHours === null ? cycles[cycle as keyof typeof cycles][1] : Math.ceil(trialHours / 24) };
}

export async function lockOrderUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { enabled: true } });
  if (!user?.enabled) throw new Error("user_disabled");
}

export async function assertOrderEligibility(tx: Prisma.TransactionClient, userId: string, planId: string, trial: boolean) {
  const existing = await tx.subscription.findFirst({
    where: { userId, planId: { not: null }, status: { in: ["ACTIVE", "EXPIRED"] } },
    orderBy: { endAt: "desc" }, select: { planId: true },
  });
  if (existing?.planId && existing.planId !== planId) throw new Error("subscription_plan_mismatch");
  if (!trial) return;
  const now = new Date();
  const used = await tx.serviceOrder.count({ where: { userId, payCycle: "TRIAL", status: "PAID" } });
  const blocked = await tx.subscription.count({ where: { userId, OR: [
    { payCycle: "TRIAL" }, { status: "ACTIVE", endAt: { gt: now } }, { planId: { not: null }, endAt: { lte: now } },
  ] } });
  if (used || blocked) throw new Error("trial_not_available");
}
