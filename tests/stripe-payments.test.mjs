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
  const { startStripeCheckout, processStripeWebhook, cancelOrderSafely, paymentSnapshot, backfillStripePaymentReferences, stripePaymentIntentId } = load("stripe-payments");
  const { payBalanceOrder } = load("order-settlement");
  const { autoCancelExpiredPendingOrders } = load("order-expiry");
  const { lockPaymentSettings, readStoredPaymentMethods, saveStoredPaymentMethods } = load("payment-methods");
  const users = [];
  const plan = await db.plan.create({ data: { name: "Stripe isolated fixture", pricingJson: { monthly: { priceCents: 1099 }, yearly: { priceCents: 47500 } } } });
  const originalPlan = await db.plan.create({ data: { name: "Renewal original unavailable plan", enabled: false, visible: false } });
  const originalServer = await db.embyServer.create({ data: { name: "Renewal original server fixture", baseUrl: "http://127.0.0.1:1", enabled: false } });
  const methodId = crypto.randomUUID();
  const config = { mode: "test", secretKey: "sk_test_fixture", webhookSecret: "whsec_fixture", siteUrl: "http://localhost:3000" };
  const sessions = new Map();
  const events = new Map();
  let sequence = 0, expireCalls = 0, loseResponse = false;
  const factory = () => ({ checkout: { sessions: {
    async create(params, options) {
      assert.equal(params.mode, "payment");
      assert.equal("payment_method_types" in params, false);
      assert.match(params.integration_identifier, /embypanel_hosted_[a-z]{8}$/);
      assert.equal(params.payment_intent_data.metadata.panel_order_id, params.client_reference_id);
      assert.ok(params.payment_intent_data.description.includes(params.client_reference_id));
      assert.ok(params.payment_intent_data.metadata.panel_username.startsWith('stripe_test_'));
      if (sessions.has(options.idempotencyKey)) return sessions.get(options.idempotencyKey);
      const session = { id: `cs_test_fixture${++sequence}`, payment_intent: `pi_fixture${sequence}`, url: `https://checkout.stripe.com/c/pay/fixture${sequence}`, expires_at: params.expires_at, mode: "payment", livemode: false, status: "open", payment_status: "unpaid", currency: "cny", amount_total: params.line_items.reduce((sum, item) => sum + item.price_data.unit_amount, 0), metadata: params.metadata, client_reference_id: params.client_reference_id };
      sessions.set(options.idempotencyKey, session);
      if (loseResponse) { loseResponse = false; throw new Stripe.errors.StripeConnectionError({ message: "fixture lost response" }); }
      return session;
    },
    async retrieve(id) { return [...sessions.values()].find((session) => session.id === id); },
    async expire(id) { expireCalls++; const session = [...sessions.values()].find((s) => s.id === id); assert.equal(session.status, "open"); session.status = "expired"; return session; },
  } }, events: { async retrieve(id) { return events.get(id); } } });
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
    const event = { id: `evt_fixture_${crypto.randomUUID()}`, created: Math.floor(Date.now() / 1000), object: "event", type, livemode: false, data: { object: structuredClone(session) } };
    events.set(event.id, event);
    const raw = JSON.stringify(event);
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
    const reference = await db.stripePayment.findUniqueOrThrow({ where: { id: first.payment.id } });
    assert.equal(reference.paymentIntentId, first.session.payment_intent);
    assert.ok(reference.stripePaidAt instanceof Date);
    assert.equal(stripePaymentIntentId({ payment_intent: { id: first.session.payment_intent } }), first.session.payment_intent);
    assert.equal(stripePaymentIntentId({ payment_intent: 'https://untrusted.example' }), null);
    await send(first.session, "checkout.session.expired");
    assert.equal((await db.stripePayment.findUniqueOrThrow({ where: { id: first.payment.id } })).state, "PAID");
    assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).endAt.getTime(), sub.endAt.getTime());
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: first.user.id } })).balanceCents, 10000);
    assert.equal((await db.stripePayment.findUniqueOrThrow({ where: { id: first.payment.id } })).stripePaidAt.getTime(), reference.stripePaidAt.getTime());
    await db.stripePayment.update({ where: { id: first.payment.id }, data: { paymentIntentId: null, stripePaidAt: null } });
    const historical = await db.stripePayment.findUniqueOrThrow({ where: { id: first.payment.id } });
    await backfillStripePaymentReferences(historical, factory);
    const backfilled = await db.stripePayment.findUniqueOrThrow({ where: { id: first.payment.id } });
    assert.equal(backfilled.paymentIntentId, reference.paymentIntentId);
    assert.equal(backfilled.stripePaidAt.getTime(), reference.stripePaidAt.getTime());
    assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).endAt.getTime(), sub.endAt.getTime());
    assert.equal((await db.serviceOrder.findUniqueOrThrow({ where: { id: paid.id } })).paidAt.getTime(), paid.paidAt.getTime());

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

    for (const status of ["ACTIVE", "EXPIRED"]) {
      const user = await db.user.create({ data: { username: `stripe_test_${crypto.randomUUID()}`, passwordHash: "fixture" } });
      users.push(user.id);
      const startAt = new Date(Date.now() - 60 * 86400000);
      const endAt = new Date(Date.now() + (status === "ACTIVE" ? 15 : -15) * 86400000);
      const original = await db.subscription.create({ data: { userId: user.id, planId: originalPlan.id, status, payCycle: "MONTHLY", startAt, endAt } });
      await db.subscriptionServer.create({ data: { subscriptionId: original.id, embyServerId: originalServer.id } });
      const renewal = await db.serviceOrder.create({ data: { userId: user.id, planId: plan.id, payCycle: "YEARLY", days: 365, amountCents: 47500 } });
      await startStripeCheckout(user.id, renewal.id, methodId, factory);
      const attempt = await db.stripePayment.findUniqueOrThrow({ where: { orderId: renewal.id } });
      const session = sessions.get(`embypanel_checkout_${attempt.id}`);
      assert.equal(session.amount_total, 48450);
      const beforePaid = Date.now();
      await send({ ...session, status: "complete", payment_status: "paid" }, "checkout.session.completed");
      const renewed = await db.subscription.findUniqueOrThrow({ where: { id: original.id }, include: { servers: true } });
      assert.equal(renewed.planId, originalPlan.id);
      assert.equal(renewed.status, "ACTIVE");
      assert.equal(renewed.payCycle, "MONTHLY");
      assert.deepEqual(renewed.servers.map((server) => server.embyServerId), [originalServer.id]);
      assert.equal(await db.subscription.count({ where: { userId: user.id } }), 1);
      if (status === "ACTIVE") {
        assert.equal(renewed.startAt.getTime(), startAt.getTime());
        assert.equal(renewed.endAt.getTime(), endAt.getTime() + 365 * 86400000);
      } else {
        assert.ok(renewed.startAt.getTime() >= beforePaid);
        assert.equal(renewed.endAt - renewed.startAt, 365 * 86400000);
      }
      const settled = await db.serviceOrder.findUniqueOrThrow({ where: { id: renewal.id } });
      assert.equal(settled.fulfillmentJson.planId, originalPlan.id);
      assert.equal(settled.fulfillmentJson.activeSubId, original.id);
      assert.deepEqual(settled.fulfillmentJson.preferredServerIds, [originalServer.id]);
      await send({ ...session, status: "complete", payment_status: "paid" }, "checkout.session.async_payment_succeeded");
      assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: original.id } })).endAt.getTime(), renewed.endAt.getTime());
    }
    const afterDelete = await createOrder();
    await db.$transaction(async (tx) => { await lockPaymentSettings(tx); await saveStoredPaymentMethods(tx, (await readStoredPaymentMethods(tx)).filter((m) => m.id !== methodId)); });
    await send({ ...afterDelete.session, status: "complete", payment_status: "paid" }, "checkout.session.completed");
    assert.equal((await db.serviceOrder.findUniqueOrThrow({ where: { id: afterDelete.order.id } })).status, "PAID");
  } finally {
    await db.$transaction(async (tx) => { await lockPaymentSettings(tx); await saveStoredPaymentMethods(tx, (await readStoredPaymentMethods(tx)).filter((m) => m.id !== methodId)); });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.plan.delete({ where: { id: plan.id } });
    await db.plan.delete({ where: { id: originalPlan.id } });
    await db.embyServer.delete({ where: { id: originalServer.id } });
  }
});

test.after(async () => { await db.$disconnect(); });
