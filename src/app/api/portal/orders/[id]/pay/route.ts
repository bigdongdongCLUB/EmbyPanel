export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const { id } = await ctx.params;

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({ where: { id, userId: user.id } });
      if (!order) throw new Error("order_not_found");
      if (order.status !== "PENDING") throw new Error("order_not_pending");

      const me = await tx.user.findUnique({ where: { id: user.id }, select: { balanceCents: true } });
      if (!me) throw new Error("user_not_found");
      if ((me.balanceCents ?? 0) < order.amountCents) throw new Error("insufficient_balance");

      await tx.user.update({ where: { id: user.id }, data: { balanceCents: { decrement: order.amountCents } } });

      const now = new Date();
      const active = await tx.subscription.findFirst({
        where: { userId: user.id, status: "ACTIVE" },
        orderBy: { endAt: "desc" },
        select: { id: true, startAt: true, endAt: true },
      });

      if (!active) {
        const endAt = new Date(now.getTime() + order.days * 24 * 3600 * 1000);
        await tx.subscription.create({
          data: {
            userId: user.id,
            planId: order.planId,
            status: "ACTIVE",
            payCycle: order.payCycle,
            startAt: now,
            endAt,
          },
        });
      } else {
        const base = active.endAt.getTime() > now.getTime() ? active.endAt : now;
        const newEnd = new Date(base.getTime() + order.days * 24 * 3600 * 1000);
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
      }

      await tx.serviceOrder.update({ where: { id: order.id }, data: { status: "PAID", paidAt: now } });
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
