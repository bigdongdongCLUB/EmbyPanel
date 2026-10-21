export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { startStripeCheckout } from "@/lib/stripe-payments";
import { paymentErrorText } from "@/lib/payment-messages";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const username = (session as typeof session & { username?: string })?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (typeof body?.methodId !== "string") return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  try { return NextResponse.json({ ok: true, ...await startStripeCheckout(user.id, (await ctx.params).id, body.methodId) }); }
  catch (error) {
    const code = error instanceof Error ? error.message : "stripe_checkout_failed";
    return NextResponse.json({ error: paymentErrorText(code) !== code ? code : "stripe_checkout_failed" }, { status: 400 });
  }
}
