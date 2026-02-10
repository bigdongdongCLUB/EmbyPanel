export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true, balanceCents: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const { id } = await ctx.params;
  const order = await prisma.serviceOrder.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      status: true,
      payCycle: true,
      days: true,
      amountCents: true,
      createdAt: true,
      paidAt: true,
      canceledAt: true,
      plan: { select: { id: true, name: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    order,
    balanceYuan: user.balanceCents / 100,
  });
}
