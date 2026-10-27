import type { Prisma, StripePayment } from "@prisma/client";

export function mixedPaymentQuote(amountCents: number, balanceCents: number, useBalance: boolean, feePercent: number) {
  const offset = useBalance ? Math.min(Math.max(0, balanceCents), amountCents) : 0;
  const remaining = amountCents - offset;
  const feeCents = Math.ceil(remaining * feePercent / 100);
  return { balanceCents: offset, remainingCents: remaining, feeCents, externalCents: remaining + feeCents };
}

// Call under the settlement/user lock. The state transition and refund commit together.
export async function releaseStripeBalance(tx: Prisma.TransactionClient, payment: Pick<StripePayment, "id" | "balanceCents">, userId: string) {
  if (payment.balanceCents <= 0) return;
  const released = await tx.stripePayment.updateMany({ where: { id: payment.id, balanceState: "HELD" }, data: { balanceState: "RELEASED" } });
  if (released.count) await tx.user.update({ where: { id: userId }, data: { balanceCents: { increment: payment.balanceCents } } });
}
