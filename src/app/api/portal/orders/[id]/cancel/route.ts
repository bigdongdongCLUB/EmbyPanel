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
  const r = await prisma.serviceOrder.updateMany({
    where: { id, userId: user.id, status: "PENDING" },
    data: { status: "CANCELED", canceledAt: new Date() },
  });

  if (!r.count) return NextResponse.json({ error: "order_not_pending_or_not_found" }, { status: 400 });

  return NextResponse.json({ ok: true, canceled: r.count });
}
