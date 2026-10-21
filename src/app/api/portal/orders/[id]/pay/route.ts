export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { payBalanceOrder } from "@/lib/order-settlement";
import { fulfillPaidOrder } from "@/lib/order-fulfillment";
import { paymentErrorText } from "@/lib/payment-messages";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const username = (session as typeof session & { username?: string })?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  const { id } = await ctx.params;
  try {
    const result = await payBalanceOrder(user.id, id);
    const fulfilled = await fulfillPaidOrder(id);
    return NextResponse.json({ ok: true, ...result, ...(!fulfilled ? { warn: "order_paid_but_sync_failed" } : {}) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "payment_failed";
    return NextResponse.json({ error: paymentErrorText(code) !== code ? code : "payment_failed" }, { status: 400 });
  }
}
