export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { lockPaymentSettings, readStoredPaymentMethods, stripeMethodsFromStored, validateStripeMethod } from "@/lib/payment-methods";
import { stripeClient } from "@/lib/stripe-payments";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { id } = await ctx.params;
    const method = await prisma.$transaction(async (tx) => { await lockPaymentSettings(tx); return stripeMethodsFromStored(await readStoredPaymentMethods(tx)).find((m) => m.id === id); });
    if (!method) return NextResponse.json({ error: "not_found" }, { status: 404 });
    validateStripeMethod(method);
    await stripeClient(method.config.secretKey).checkout.sessions.list({ limit: 1 });
    return NextResponse.json({ ok: true, mode: method.config.mode });
  } catch { return NextResponse.json({ error: "stripe_connection_failed" }, { status: 400 }); }
}
