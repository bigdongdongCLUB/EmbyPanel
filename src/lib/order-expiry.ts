import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const ORDER_PENDING_TTL_MINUTES = 30;

export function isOrderPendingExpired(createdAt: Date, nowMs: number = Date.now()) {
  return nowMs - createdAt.getTime() >= ORDER_PENDING_TTL_MINUTES * 60 * 1000;
}

export async function autoCancelExpiredPendingOrders(
  db: Pick<Prisma.TransactionClient, "serviceOrder"> = prisma,
  extraWhere?: Prisma.ServiceOrderWhereInput,
) {
  const now = new Date();
  const expireBefore = new Date(now.getTime() - ORDER_PENDING_TTL_MINUTES * 60 * 1000);
  return db.serviceOrder.updateMany({
    where: {
      status: "PENDING",
      createdAt: { lt: expireBefore },
      ...(extraWhere || {}),
      OR: [{ stripePayment: null }, { stripePayment: { state: { in: ["FAILED", "EXPIRED"] } } }],
    },
    data: {
      status: "CANCELED",
      canceledAt: now,
    },
  });
}
