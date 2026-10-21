import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import Stripe from "stripe";
const require = createRequire(import.meta.url);
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
const modules = new Map();
function load(name) {
  if (name === "db") return { prisma: db };
  if (modules.has(name)) return modules.get(name);
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = { exports: {} }; modules.set(name, mod.exports);
  new Function("module", "exports", "require", code)(mod, mod.exports, (path) => path.startsWith("@/lib/") ? load(path.slice(6)) : require(path));
  return mod.exports;
}

test("Stripe configuration validates mode and canonical HTTPS addresses", () => {
  const { stripeSiteUrl, validateStripeMethod } = load("payment-methods");
  assert.equal(stripeSiteUrl("https://panel.example.com/", "live"), "https://panel.example.com");
  assert.equal(stripeSiteUrl("http://localhost:3000", "test"), "http://localhost:3000");
  for (const url of ["http://panel.example.com", "https://user:pw@panel.example.com", "https://panel.example.com/path", "https://panel.example.com?next=evil", "javascript:alert(1)"]) assert.throws(() => stripeSiteUrl(url, "live"));
  assert.throws(() => validateStripeMethod({ config: { secretKey: "sk_test_example", webhookSecret: "whsec_example", mode: "live", siteUrl: "https://panel.example.com" } }));
});

test("Stripe checkout and signed callbacks settle once, isolate balance, handle delays, mismatches and cancellation", { skip: process.env.RUN_STRIPE_DB_TESTS !== "1" }, async () => {
  const { startStripeCheckout, processStripeWebhook, cancelOrderSafely, paymentSnapshot } = load("stripe-payments");
  const { payBalanceOrder } = load("order-settlement");
  const { autoCancelExpiredPendingOrders } = load("order-expiry");
  const { lockPaymentSettings, readStoredPaymentMethods, saveStoredPaymentMethods } = load("payment-methods");
  const users = [];
  const plan = await db.plan.create({ data: { name: "Stripe isolated fixture", pricingJson: { monthly: { priceCents: 1099 } } } });
  const methodId = crypto.randomUUID();
  const config = { mode: "test", secretKey: "sk_test_fixture", webhookSecret: "whsec_fixture", siteUrl: "http://localhost:3000" };
  const sessions = new Map();
  let sequence = 0, expireCalls = 0, loseResponse = false;
  const factory = () => ({ checkout: { sessions: {
    async create(params, options) {
      assert.equal(params.mode, "payment");
      assert.equal("payment_method_types" in params, false);
      assert.match(params.integration_identifier, /embypanel_hosted_[a-z]{8}$/);
      if (sessions.has(options.idempotencyKey)) return sessions.get(options.idempotencyKey);
      const session = { id: `cs_test_fixture${++sequence}`, url: `https://checkout.stripe.com/c/pay/fixture${sequence}`, expires_at: params.expires_at, mode: "payment", livemode: false, status: "open", payment_status: "unpaid", currency: "cny", amount_total: params.line_items.reduce((sum, item) => sum + item.price_data.unit_amount, 0), metadata: params.metadata, client_reference_id: params.client_reference_id };
      sessions.set(options.idempotencyKey, session);
      if (loseResponse) { loseResponse = false; throw new Stripe.errors.StripeConnectionError({ message: "fixture lost response" }); }
      return session;
    },
    async retrieve(id) { return [...sessions.values()].find((session) => session.id === id); },
    async expire(id) { expireCalls++; const session = [...sessions.values()].find((s) => s.id === id); assert.equal(session.status, "open"); session.status = "expired"; return session; },
  } } });
  const createOrder = async (unknown = false) => {
    const user = await db.user.create({ data: { username: `stripe_test_${crypto.randomUUID()}`, passwordHash: "fixture", balanceCents: 10000 } });
    users.push(user.id);
    const order = await db.serviceOrder.create({ data: { userId: user.id, planId: plan.id, payCycle: "MONTHLY", days: 30, amountCents: 1099 } });
    if (unknown) {
      await assert.rejects(startStripeCheckout(user.id, order.id, methodId, factory), /stripe_checkout_failed/);
      await assert.rejects(payBalanceOrder(user.id, order.id), /stripe_payment_in_progress/);
    }
    await startStripeCheckout(user.id, order.id, methodId, factory);
    const payment = await db.stripePayment.findUniqueOrThrow({ where: { orderId: order.id } });
    const session = sessions.get(`embypanel_checkout_${payment.id}`);
    return { user, order, payment, session };
  };
  const signed = (session, type, secret = config.webhookSecret) => {
    const raw = JSON.stringify({ id: `evt_fixture_${crypto.randomUUID()}`, object: "event", type, livemode: false, data: { object: session } });
    return { raw, signature: Stripe.webhooks.generateTestHeaderString({ payload: raw, secret }) };
  };
  const send = async (session, type) => { const { raw, signature } = signed(session, type); return processStripeWebhook(methodId, raw, signature); };
  try {
    await db.$transaction(async (tx) => {
      await lockPaymentSettings(tx);
      const list = await readStoredPaymentMethods(tx);
      list.push({ id: methodId, name: "test", processor: "stripe", priority: 0, enabled: true, feeEnabled: true, feePercent: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), config });
      await saveStoredPaymentMethods(tx, list);
    });
    const first = await createOrder();
    assert.equal(first.payment.feeCents, 22);
    assert.equal(first.session.amount_total, 1121);
    assert.ok(!JSON.stringify(first.payment.credentials).includes(config.secretKey));
    assert.equal(paymentSnapshot(first.payment).config.secretKey, config.secretKey);
    const again = await startStripeCheckout(first.user.id, first.order.id, methodId, factory);
    assert.equal(again.url, first.session.url);
    assert.equal(sequence, 1);
    await assert.rejects(payBalanceOrder(first.user.id, first.order.id), /stripe_payment_in_progress/);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: first.user.id } })).balanceCents, 10000);
    const invalid = signed(first.session, "checkout.session.completed", "whsec_wrong");
    await assert.rejects(processStripeWebhook(methodId, invalid.raw, invalid.signature));
    assert.equal((await db.serviceOrder.findUniqueOrThrow({ where: { id: first.order.id } })).status, "PENDING");
    await send(first.session, "checkout.session.completed");
    assert.equal(await db.subscription.count({ where: { userId: first.user.id } }), 0);
    first.session.status = "complete";
    await send(first.session, "checkout.session.completed");
    assert.equal((await db.stripePayment.findUniqueOrThrow({ where: { id: first.payment.id } })).state, "PROCESSING");
    await db.serviceOrder.update({ where: { id: first.order.id }, data: { createdAt: new Date(Date.now() - 60 * 60000) } });
    await autoCancelExpiredPendingOrders(db, { id: first.order.id });
    assert.equal((await db.serviceOrder.findUniqueOrThrow({ where: { id: first.order.id } })).status, "PENDING");
    first.session.payment_status = "paid";
    await Promise.all([send(first.session, "checkout.session.async_payment_succeeded"), send(first.session, "checkout.session.completed")]);
    const paid = await db.serviceOrder.findUniqueOrThrow({ where: { id: first.order.id } });
    assert.equal(paid.status, "PAID"); assert.equal(paid.paymentSource, "STRIPE"); assert.equal(paid.fulfillmentStatus, "PENDING");
    const sub = await db.subscription.findFirstOrThrow({ where: { userId: first.user.id } });
    assert.equal(sub.endAt - sub.startAt, 30 * 86400000);
    await send(first.session, "checkout.session.expired");
    assert.equal((await db.stripePayment.findUniqueOrThrow({ where: { id: first.payment.id } })).state, "PAID");
    assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).endAt.getTime(), sub.endAt.getTime());
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: first.user.id } })).balanceCents, 10000);

    const mismatch = await createOrder();
    await send({ ...mismatch.session, status: "complete", payment_status: "paid", amount_total: 1 }, "checkout.session.completed");
    assert.equal((await db.stripePayment.findUniqueOrThrow({ where: { id: mismatch.payment.id } })).state, "REVIEW");
    assert.equal(await db.subscription.count({ where: { userId: mismatch.user.id } }), 0);
    const canceled = await createOrder();
    await cancelOrderSafely(canceled.user.id, canceled.order.id, factory);
    assert.equal(expireCalls, 1);
    assert.equal((await db.serviceOrder.findUniqueOrThrow({ where: { id: canceled.order.id } })).status, "CANCELED");
    const processing = await createOrder();
    processing.session.status = "complete";
    await assert.rejects(cancelOrderSafely(processing.user.id, processing.order.id, factory), /stripe_payment_in_progress/);
    const disabled = await createOrder();
    await db.user.update({ where: { id: disabled.user.id }, data: { enabled: false } });
    await send({ ...disabled.session, status: "complete", payment_status: "paid" }, "checkout.session.completed");
    assert.equal((await db.stripePayment.findUniqueOrThrow({ where: { id: disabled.payment.id } })).state, "REVIEW");
    assert.equal(await db.subscription.count({ where: { userId: disabled.user.id } }), 0);

    const beforeRecovery = sequence;
    loseResponse = true;
    const recovered = await createOrder(true);
    assert.equal(sequence, beforeRecovery + 1);
    assert.equal(recovered.payment.state, "OPEN");
    const afterDelete = await createOrder();
    await db.$transaction(async (tx) => { await lockPaymentSettings(tx); await saveStoredPaymentMethods(tx, (await readStoredPaymentMethods(tx)).filter((m) => m.id !== methodId)); });
    await send({ ...afterDelete.session, status: "complete", payment_status: "paid" }, "checkout.session.completed");
    assert.equal((await db.serviceOrder.findUniqueOrThrow({ where: { id: afterDelete.order.id } })).status, "PAID");
  } finally {
    await db.$transaction(async (tx) => { await lockPaymentSettings(tx); await saveStoredPaymentMethods(tx, (await readStoredPaymentMethods(tx)).filter((m) => m.id !== methodId)); });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.plan.delete({ where: { id: plan.id } });
  }
});

test.after(async () => { await db.$disconnect(); });
