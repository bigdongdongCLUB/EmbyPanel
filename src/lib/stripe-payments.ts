import Stripe from "stripe";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { StripePayment } from "@prisma/client";
import { decryptString, encryptString, type Encrypted } from "@/lib/crypto";
import { lockSettlement, grantPaidOrder } from "@/lib/order-settlement";
import { assertOrderEligibility, quoteOrder } from "@/lib/order-pricing";
import { isOrderPendingExpired } from "@/lib/order-expiry";
import { lockPaymentSettings, readStoredPaymentMethods, stripeMethodsFromStored, stripeMethodReady, stripeSiteUrl, type StripeMethod } from "@/lib/payment-methods";

export const stripeClient = (key: string) => new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
type ClientFactory = typeof stripeClient;
type Snapshot = { config: StripeMethod["config"]; params: Stripe.Checkout.SessionCreateParams };
export function paymentSnapshot(payment: StripePayment): Snapshot {
  return JSON.parse(decryptString(payment.credentials as Encrypted));
}
export async function availableStripeMethods() {
  return prisma.$transaction(async (tx) => {
    await lockPaymentSettings(tx);
    return stripeMethodsFromStored(await readStoredPaymentMethods(tx)).filter((m) => m.enabled && stripeMethodReady(m))
      .map((m) => ({ id: m.id, name: m.name, description: m.description, mode: m.config.mode, feePercent: m.feeEnabled ? m.feePercent : 0 }));
  });
}
export async function startStripeCheckout(userId: string, orderId: string, methodId: string, factory: ClientFactory = stripeClient) {
  const payment = await prisma.$transaction(async (tx) => {
    await lockSettlement(tx, userId, orderId);
    const order = await tx.serviceOrder.findFirst({ where: { id: orderId, userId }, include: { plan: true, stripePayment: true } });
    if (!order) throw new Error("order_not_found");
    if (order.status !== "PENDING") throw new Error("order_not_pending");
    if (order.stripePayment) {
      if (order.stripePayment.methodId !== methodId) throw new Error("stripe_payment_in_progress");
      return order.stripePayment;
    }
    if (isOrderPendingExpired(order.createdAt)) throw new Error("order_expired");
    if (!order.plan.enabled || !order.plan.visible) throw new Error("plan_not_available");
    const quote = quoteOrder(order.plan.pricingJson, order.payCycle);
    if (order.amountCents !== quote.amountCents || order.days !== quote.days || order.trialHours !== quote.trialHours) throw new Error("order_price_changed_recreate");
    if (order.amountCents <= 0) throw new Error("stripe_zero_amount_use_balance");
    await assertOrderEligibility(tx, userId, order.planId, order.payCycle === "TRIAL");
    await lockPaymentSettings(tx);
    const method = stripeMethodsFromStored(await readStoredPaymentMethods(tx)).find((m) => m.id === methodId && m.enabled && stripeMethodReady(m));
    if (!method) throw new Error("stripe_method_unavailable");
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 31 * 60000);
    const feeCents = method.feeEnabled ? Math.ceil(order.amountCents * method.feePercent / 100) : 0;
    if (!Number.isSafeInteger(order.amountCents + feeCents) || order.amountCents + feeCents > 2147483647) throw new Error("invalid_payment_amount");
    const siteUrl = stripeSiteUrl(method.config.siteUrl, method.config.mode);
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment", client_reference_id: order.id,
      integration_identifier: `embypanel_hosted_${Array.from(randomBytes(8), (n) => String.fromCharCode(97 + n % 26)).join("")}`,
      metadata: { paymentAttemptId: id, orderId, userId },
      line_items: [{ quantity: 1, price_data: { currency: "cny", unit_amount: order.amountCents, product_data: { name: order.plan.name } } },
        ...(feeCents ? [{ quantity: 1, price_data: { currency: "cny", unit_amount: feeCents, product_data: { name: "支付手续费" } } }] : [])],
      success_url: `${siteUrl}/portal/orders/${orderId}?stripe_return=1`, cancel_url: `${siteUrl}/portal/orders/${orderId}?stripe_cancel=1`,
      expires_at: Math.floor(expiresAt.getTime() / 1000), locale: "zh",
    };
    return tx.stripePayment.create({ data: {
      id, orderId, methodId, amountCents: order.amountCents + feeCents, feeCents,
      livemode: method.config.mode === "live", expiresAt,
      credentials: encryptString(JSON.stringify({ config: method.config, params })),
    } });
  });
  if (payment.state === "OPEN" && payment.checkoutUrl) return { url: payment.checkoutUrl };
  if (payment.state !== "CREATING") throw new Error("stripe_payment_in_progress");
  return createStripeSession(payment, factory);
}
export async function createStripeSession(payment: StripePayment, factory: ClientFactory = stripeClient) {
  if (payment.expiresAt.getTime() <= Date.now()) {
    await prisma.stripePayment.updateMany({ where: { id: payment.id, state: "CREATING" }, data: { state: "REVIEW", errorCode: "checkout_creation_unknown" } });
    throw new Error("stripe_payment_review");
  }
  const snapshot = paymentSnapshot(payment);
  let session: Stripe.Checkout.Session;
  try {
    session = await factory(snapshot.config.secretKey).checkout.sessions.create(snapshot.params, { idempotencyKey: `embypanel_checkout_${payment.id}` });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError || error instanceof Stripe.errors.StripeAuthenticationError || error instanceof Stripe.errors.StripePermissionError) {
      await prisma.stripePayment.updateMany({ where: { id: payment.id, state: "CREATING" }, data: { state: "FAILED", errorCode: "checkout_configuration_error" } });
    }
    throw new Error("stripe_checkout_failed");
  }
  if (!session.url || session.livemode !== payment.livemode) throw new Error("stripe_checkout_failed");
  await prisma.stripePayment.updateMany({ where: { id: payment.id, state: "CREATING" }, data: { sessionId: session.id, checkoutUrl: session.url, expiresAt: new Date(session.expires_at * 1000), state: "OPEN" } });
  return { url: session.url };
}

export function stripeSessionMatches(payment: StripePayment, session: Stripe.Checkout.Session, userId: string) {
  return (!payment.sessionId || payment.sessionId === session.id) && session.metadata?.paymentAttemptId === payment.id &&
    session.metadata?.orderId === payment.orderId && session.metadata?.userId === userId && session.client_reference_id === payment.orderId &&
    session.currency === payment.currency && session.amount_total === payment.amountCents && session.livemode === payment.livemode && session.mode === "payment";
}
export async function processStripeWebhook(methodId: string, raw: string, signature: string) {
  // Only use the unsigned ID to locate a signing key. No business state changes before verification.
  const envelope = JSON.parse(raw);
  const attemptId = envelope?.data?.object?.metadata?.paymentAttemptId;
  if (typeof attemptId !== "string" || attemptId.length > 100) throw new Error("invalid_webhook");
  const payment = await prisma.stripePayment.findFirst({ where: { id: attemptId, methodId } });
  if (!payment) throw new Error("invalid_webhook");
  const config = paymentSnapshot(payment).config;
  const event = stripeClient(config.secretKey).webhooks.constructEvent(raw, signature, config.webhookSecret);
  const supported = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"];
  if (!supported.includes(event.type)) return;
  const session = event.data.object as Stripe.Checkout.Session;
  await applyStripeSession(payment.id, session, event.type, event.id);
}
export async function applyStripeSession(attemptId: string, session: Stripe.Checkout.Session, eventType: string, eventId: string) {
  const initial = await prisma.stripePayment.findUniqueOrThrow({ where: { id: attemptId }, include: { order: true } });
  await prisma.$transaction(async (tx) => {
    await lockSettlement(tx, initial.order.userId, initial.orderId).catch(async (error) => {
      // Paid funds must stay recorded even when an account was disabled after checkout.
      if (!(error instanceof Error) || error.message !== "user_disabled") throw error;
    });
    const payment = await tx.stripePayment.findUniqueOrThrow({ where: { id: attemptId }, include: { order: true } });
    if (!stripeSessionMatches(payment, session, payment.order.userId)) {
      await tx.stripePayment.update({ where: { id: attemptId }, data: { state: "REVIEW", errorCode: "session_mismatch", lastEventId: eventId } });
      return;
    }
    if (payment.state === "PAID" || payment.state === "REVIEW") return;
    const update = { sessionId: session.id, lastEventId: eventId };
    if (session.payment_status === "paid" && session.status === "complete") {
      const user = await tx.user.findUnique({ where: { id: payment.order.userId }, select: { enabled: true } });
      let eligible = !!user?.enabled;
      try { await assertOrderEligibility(tx, payment.order.userId, payment.order.planId, payment.order.payCycle === "TRIAL"); } catch { eligible = false; }
      if (payment.order.status === "PAID" || !eligible) {
        await tx.stripePayment.update({ where: { id: attemptId }, data: { ...update, state: "REVIEW", errorCode: "paid_requires_manual_review" } });
        return;
      }
      await grantPaidOrder(tx, payment.order, "STRIPE");
      await tx.stripePayment.update({ where: { id: attemptId }, data: { ...update, state: "PAID", errorCode: null } });
    } else if (eventType === "checkout.session.expired" || eventType === "checkout.session.async_payment_failed") {
      await tx.stripePayment.update({ where: { id: attemptId }, data: { ...update, state: eventType.endsWith("expired") ? "EXPIRED" : "FAILED" } });
      await tx.serviceOrder.updateMany({ where: { id: payment.orderId, status: "PENDING" }, data: { status: "CANCELED", canceledAt: new Date() } });
    } else if (session.status === "complete") {
      await tx.stripePayment.update({ where: { id: attemptId }, data: { ...update, state: "PROCESSING" } });
    }
  });
}

export async function cancelOrderSafely(userId: string, orderId: string, factory: ClientFactory = stripeClient) {
  return prisma.$transaction(async (tx) => {
    await lockSettlement(tx, userId, orderId);
    const order = await tx.serviceOrder.findFirst({ where: { id: orderId, userId }, include: { stripePayment: true } });
    if (!order || order.status !== "PENDING") throw new Error("order_not_pending");
    const payment = order.stripePayment;
    if (payment && !["FAILED", "EXPIRED"].includes(payment.state)) {
      if (!payment.sessionId || payment.state !== "OPEN") throw new Error("stripe_payment_in_progress");
      const stripe = factory(paymentSnapshot(payment).config.secretKey);
      const session = await stripe.checkout.sessions.retrieve(payment.sessionId);
      if (session.status === "complete") throw new Error("stripe_payment_in_progress");
      if (session.status !== "expired") await stripe.checkout.sessions.expire(payment.sessionId);
      await tx.stripePayment.update({ where: { id: payment.id }, data: { state: "EXPIRED" } });
    }
    await tx.serviceOrder.update({ where: { id: orderId }, data: { status: "CANCELED", canceledAt: new Date() } });
  }, { timeout: 60000 });
}
