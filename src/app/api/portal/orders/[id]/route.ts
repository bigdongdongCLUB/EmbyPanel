export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { availableStripeMethods } from "@/lib/stripe-payments";
import { prisma } from "@/lib/db";
import { autoCancelExpiredPendingOrders } from "@/lib/order-expiry";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as typeof session & { username?: string }).username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true, balanceCents: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const { id } = await ctx.params;
  await autoCancelExpiredPendingOrders(prisma, { id, userId: user.id });

  const order = await prisma.serviceOrder.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      status: true,
      payCycle: true,
      days: true,
      trialHours: true,
      amountCents: true,
      createdAt: true,
      paidAt: true,
      canceledAt: true,
      paymentSource: true, fulfillmentStatus: true,
      stripePayment: { select: { methodId: true, state: true, feeCents: true, amountCents: true } },
      plan: { select: { id: true, name: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    order,
    balanceYuan: user.balanceCents / 100,
    paymentMethods: await availableStripeMethods().catch(() => []),
  });
}
