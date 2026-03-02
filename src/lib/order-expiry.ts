import { prisma } from "@/lib/db";

export const ORDER_PENDING_TTL_MINUTES = 30;

export function isOrderPendingExpired(createdAt: Date, nowMs: number = Date.now()) {
  return nowMs - createdAt.getTime() >= ORDER_PENDING_TTL_MINUTES * 60 * 1000;
}

export async function autoCancelExpiredPendingOrders(
  db: any = prisma,
  extraWhere?: Record<string, any>,
) {
  const now = new Date();
  const expireBefore = new Date(now.getTime() - ORDER_PENDING_TTL_MINUTES * 60 * 1000);
  return db.serviceOrder.updateMany({
    where: {
      status: "PENDING",
      createdAt: { lt: expireBefore },
      ...(extraWhere || {}),
    },
    data: {
      status: "CANCELED",
      canceledAt: now,
    },
  });
}
