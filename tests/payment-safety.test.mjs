import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled)(mod, mod.exports,
    (path) => path.startsWith("@/lib/") ? load(path.slice(6)) : require(path));
  modules.set(name, mod.exports);
  return mod.exports;
}

test("quotes use server cents and fixed periods, not client amount or duration", () => {
  const { quoteOrder } = load("order-pricing");
  const prices = { monthly: { priceCents: 1099 }, trial: { priceCents: 0, hours: 1 } };
  assert.deepEqual(quoteOrder(prices, "MONTHLY"), { amountCents: 1099, days: 30, trialHours: null });
  assert.deepEqual(quoteOrder(prices, "TRIAL"), { amountCents: 0, days: 1, trialHours: 1 });
  for (const priceCents of [-1, 1.2, Infinity, 2147483648, "100"]) {
    assert.throws(() => quoteOrder({ monthly: { priceCents } }, "MONTHLY"));
  }
  assert.throws(() => quoteOrder(prices, "YEARLY"));
  assert.throws(() => quoteOrder({ trial: { priceCents: 0, hours: 0 } }, "TRIAL"));
  assert.deepEqual(quoteOrder({ trial: { priceCents: 50, days: 2 } }, "TRIAL"), { amountCents: 50, days: 2, trialHours: 48 });
  for (const [cycle, key, days] of [["QUARTERLY", "quarterly", 90], ["HALF_YEARLY", "halfYearly", 180], ["YEARLY", "yearly", 365], ["TWO_YEARLY", "twoYearly", 730]]) {
    assert.equal(quoteOrder({ [key]: { priceCents: 1 } }, cycle).days, days);
  }
});

test("payment cannot clear pending or failed unbans even after their timer elapsed", () => {
  const { hasUnresolvedPlaybackPenalty: has } = load("payment-penalty");
  const settings = (status) => [{ key: "anomaly_penalty_records", valueJson: [{ userId: "u", embyServerId: "s", status, unlockAt: "2000-01-01" }] }];
  assert.equal(has(settings("PENDING"), "s", "u"), true);
  assert.equal(has(settings("FAILED_UNBAN"), "s", "u"), true);
  assert.equal(has(settings("UNBANNED"), "s", "u"), false);
  assert.equal(has(settings("PENDING"), "other", "u"), false);
  assert.equal(has([{ key: "anomaly_penalty_state", valueJson: { "s:u": { penaltyActive: true } } }], "s", "u"), true);
  assert.equal(has([], "s", "u"), false);
});

test("payment secrets encrypt legacy values, redact responses, preserve blank edits and reject tampering", () => {
  const previousKey = process.env.EMBYPANEL_ENCRYPTION_KEY;
  process.env.EMBYPANEL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  try {
    const { encryptPaymentMethod: encrypt, decryptPaymentMethod: decrypt, redactPaymentMethod: redact, preservePaymentSecrets: preserve } = load("payment-secrets");
    const original = { id: "test", config: { secretKey: "sk_test_example", webhookSecret: "whsec_example", merchantKey: "merchant_example", publishableKey: "pk_test_example" } };
    const stored = encrypt(original);
    for (const key of ["secretKey", "webhookSecret", "merchantKey"]) {
      assert.notEqual(stored.config[key], original.config[key]);
      assert.ok(stored.config[key].startsWith("encrypted:v1:"));
    }
    assert.deepEqual(decrypt(stored), original);
    assert.deepEqual(decrypt(original), original);
    const view = redact(original);
    assert.equal(view.config.secretKey, "");
    assert.equal(view.config.webhookSecret, "");
    assert.equal(view.config.merchantKey, "");
    assert.equal(view.config.hasSecretKey, true);
    assert.equal(view.config.publishableKey, "pk_test_example");
    assert.equal(preserve({ secretKey: "" }, original.config).secretKey, original.config.secretKey);
    assert.equal(preserve({ secretKey: "replacement" }, original.config).secretKey, "replacement");
    assert.throws(() => preserve(stored.config));
    assert.throws(() => decrypt({ config: { secretKey: "encrypted:v1:invalid" } }));
    assert.equal(original.config.secretKey, "sk_test_example");
  } finally {
    if (previousKey === undefined) delete process.env.EMBYPANEL_ENCRYPTION_KEY;
    else process.env.EMBYPANEL_ENCRYPTION_KEY = previousKey;
  }
});

test("authenticated local API: trusted prices, repeat payments, insufficient funds, trials and masked settings", { skip: process.env.RUN_PAYMENT_API_TESTS !== "1" }, async () => {
  require("dotenv/config");
  const { PrismaClient } = require("@prisma/client");
  const { encode } = require("next-auth/jwt");
  const db = new PrismaClient();
  const base = process.env.PAYMENT_API_TEST_URL || "http://localhost:3000";
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Run against an isolated local test server only");
  const users = [], plans = [];
  let methodId;
  let adminCall;
  try {
    const plan = await db.plan.create({ data: { name: "payment_safety_test", pricingJson: { monthly: { priceCents: 1099 }, trial: { priceCents: 0, hours: 1 } } } });
    plans.push(plan.id);
    const makeUser = async (balanceCents = 10000) => {
      const user = await db.user.create({ data: { username: `payment_test_${crypto.randomUUID()}`, passwordHash: "test", role: "ADMIN", balanceCents } });
      users.push(user.id);
      const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { userId: user.id, username: user.username, role: "ADMIN", panelLoginAt: Date.now() }, maxAge: 600 });
      const call = async (path, body, method = "POST") => {
        const response = await fetch(base + path, { method, headers: { cookie: `next-auth.session-token=${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: response.status, body: await response.json() };
      };
      return { user, call };
    };
    const { user, call } = await makeUser();
    adminCall = call;
    const create = (api, cycle = "MONTHLY") => api("/api/portal/orders", { planId: plan.id, payCycle: cycle, amountYuan: 0, days: 999999, trialHours: 168 });
    const pay = (api, id) => api(`/api/portal/orders/${id}/pay`);
    const first = await create(call);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const planDetail = await call(`/api/portal/plans/${plan.id}`, undefined, "GET");
    assert.equal(planDetail.body.cycles.find((cycle) => cycle.key === "MONTHLY").priceYuan, 10.99);
    const orderId = first.body.orderId;
    const order = await db.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(order.amountCents, 1099);
    assert.equal(order.days, 30);
    const payments = await Promise.all(Array.from({ length: 4 }, () => pay(call, orderId)));
    for (const result of payments) assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(payments.filter((r) => r.body.alreadyPaid).length, 3);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).balanceCents, 8901);
    assert.equal(await db.subscription.count({ where: { userId: user.id } }), 1);
    const subscription = await db.subscription.findFirstOrThrow({ where: { userId: user.id } });
    assert.equal(subscription.endAt - subscription.startAt, 30 * 86400000);

    const changed = await create(call);
    await db.serviceOrder.update({ where: { id: changed.body.orderId }, data: { amountCents: 0 } });
    assert.equal((await pay(call, changed.body.orderId)).body.error, "order_price_changed_recreate");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).balanceCents, 8901);
    const canceled = await create(call);
    assert.equal((await call(`/api/portal/orders/${canceled.body.orderId}/cancel`)).status, 200);
    assert.equal((await pay(call, canceled.body.orderId)).body.error, "order_not_pending");
    const expired = await create(call);
    await db.serviceOrder.update({ where: { id: expired.body.orderId }, data: { createdAt: new Date(Date.now() - 31 * 60000) } });
    assert.equal((await pay(call, expired.body.orderId)).status, 400);

    const poor = await makeUser(1099);
    const orders = await Promise.all([create(poor.call), create(poor.call)]);
    const results = await Promise.all(orders.map((r) => pay(poor.call, r.body.orderId)));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.body.error === "insufficient_balance").length, 1);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: poor.user.id } })).balanceCents, 0);
    assert.equal((await pay(poor.call, orderId)).body.error, "order_not_found");

    const trial = await makeUser();
    const trials = await Promise.all([create(trial.call, "TRIAL"), create(trial.call, "TRIAL")]);
    const trialResults = await Promise.all(trials.map((r) => pay(trial.call, r.body.orderId)));
    assert.equal(trialResults.filter((r) => r.status === 200).length, 1);
    assert.equal(trialResults.filter((r) => r.body.error === "trial_not_available").length, 1);
    assert.equal((await create(trial.call, "TRIAL")).body.error, "trial_not_available");

    const otherPlan = await db.plan.create({ data: { name: "payment_safety_other_plan", pricingJson: { monthly: { priceCents: 1 } } } });
    plans.push(otherPlan.id);
    assert.equal((await call("/api/portal/orders", { planId: otherPlan.id, payCycle: "MONTHLY" })).body.error, "subscription_plan_mismatch");
    const disabled = await makeUser();
    const disabledOrder = await create(disabled.call);
    await db.user.update({ where: { id: disabled.user.id }, data: { enabled: false } });
    assert.equal((await pay(disabled.call, disabledOrder.body.orderId)).body.error, "user_disabled");
    assert.equal((await create(disabled.call)).body.error, "user_disabled");

    methodId = `payment_test_${crypto.randomUUID()}`;
    const config = { secretKey: "sk_test_localexample", webhookSecret: "whsec_localexample", siteUrl: "http://localhost:3000", mode: "test" };
    const methodResponse = await call("/api/admin/payments", { name: "test", processor: "stripe", config });
    assert.equal(methodResponse.status, 200, JSON.stringify(methodResponse.body));
    methodId = methodResponse.body.id;
    const list = await call("/api/admin/payments", undefined, "GET");
    assert.equal(list.status, 200);
    const method = list.body.items.find((m) => m.id === methodId);
    assert.equal(method.config.secretKey, "");
    assert.equal(method.config.hasSecretKey, true);
    assert.ok(!JSON.stringify(list.body).includes(config.secretKey));
    assert.equal((await call("/api/admin/payments", { ...method, name: "edited" })).status, 200);
    const saved = await db.appSetting.findUniqueOrThrow({ where: { key: "payment_methods" } });
    const stored = saved.valueJson.find((m) => m.id === methodId);
    assert.ok(stored.config.secretKey.startsWith("encrypted:v1:"));
    const { decryptPaymentMethod } = load("payment-secrets");
    assert.equal(decryptPaymentMethod(stored).config.secretKey, config.secretKey);
  } finally {
    if (methodId && adminCall) await adminCall(`/api/admin/payments?id=${encodeURIComponent(methodId)}`, undefined, "DELETE");
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.plan.deleteMany({ where: { id: { in: plans } } });
    await db.$disconnect();
  }
});
