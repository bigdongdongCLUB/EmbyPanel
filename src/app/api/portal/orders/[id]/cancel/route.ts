export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cancelOrderSafely } from "@/lib/stripe-payments";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const username = (session as typeof session & { username?: string })?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  try { await cancelOrderSafely(user.id, (await ctx.params).id); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error && error.message === "order_not_pending" ? "order_not_pending" : "stripe_payment_in_progress" }, { status: 400 }); }
}
