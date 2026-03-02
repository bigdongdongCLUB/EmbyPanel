export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { autoCancelExpiredPendingOrders } from "@/lib/order-expiry";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  await autoCancelExpiredPendingOrders(prisma, { userId: user.id });

  const rows = await prisma.serviceOrder.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      payCycle: true,
      days: true,
      amountCents: true,
      createdAt: true,
      paidAt: true,
      canceledAt: true,
      plan: { select: { name: true } },
    },
  });

  return NextResponse.json({ ok: true, rows });
}
