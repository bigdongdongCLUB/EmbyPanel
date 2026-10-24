export const runtime = "nodejs";
export const maxDuration = 300;
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { fulfillPaidOrder } from "@/lib/order-fulfillment";
import { applyStripeSession, backfillStripePaymentReferences, createStripeSession, paymentSnapshot, stripeClient } from "@/lib/stripe-payments";
export async function POST(req: Request) {
  const secret = process.env.INTERNAL_JOBS_SECRET?.trim();
  if (!secret || req.headers.get("x-internal-jobs-secret") !== secret) {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const payments = await prisma.stripePayment.findMany({ where: { state: { in: ["CREATING", "OPEN", "PROCESSING"] }, updatedAt: { lt: new Date(Date.now() - 30000) } }, orderBy: { updatedAt: "asc" }, take: 3 });
  let reconciled = 0, failures = 0, fulfilled = 0;
  for (const payment of payments) {
    try {
      if (payment.state === "CREATING") await createStripeSession(payment);
      else if (payment.sessionId) {
        const session = await stripeClient(paymentSnapshot(payment).config.secretKey).checkout.sessions.retrieve(payment.sessionId);
        await applyStripeSession(payment.id, session, session.status === "expired" ? "checkout.session.expired" : "checkout.session.completed", "reconcile");
      }
      reconciled++;
    } catch { failures++; }
    await prisma.stripePayment.updateMany({ where: { id: payment.id }, data: { updatedAt: new Date() } });
  }
  const orders = await prisma.serviceOrder.findMany({ where: { status: "PAID", fulfillmentStatus: { in: ["PENDING", "FAILED"] }, fulfillmentUpdatedAt: { lt: new Date(Date.now() - 30000) } }, orderBy: { fulfillmentUpdatedAt: "asc" }, take: 5, select: { id: true } });
  for (const order of orders) { if (await fulfillPaidOrder(order.id)) fulfilled++; else failures++; }
  const historical = await prisma.stripePayment.findMany({ where: { state: "PAID", paymentIntentId: null, sessionId: { not: null } }, orderBy: { updatedAt: "asc" }, take: 3 });
  let referencesBackfilled = 0;
  for (const payment of historical) {
    try { if (await backfillStripePaymentReferences(payment)) referencesBackfilled++; }
    catch { failures++; }
    await prisma.stripePayment.update({ where: { id: payment.id }, data: { updatedAt: new Date() } });
  }
  return NextResponse.json({ ok: true, reconciled, fulfilled, referencesBackfilled, failures });
}
