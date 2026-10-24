import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
const modules = new Map();
function load(name) {
  if (name === "db") return { prisma: db };
  if (modules.has(name)) return modules.get(name);
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  modules.set(name, mod.exports);
  new Function("module", "exports", "require", code)(mod, mod.exports, (path) => path.startsWith("@/lib/") ? load(path.slice(6)) : require(path));
  return mod.exports;
}

test("retry backoff is capped and diagnostics redact credentials", () => {
  const { safeSyncDetail, redemptionRetryDelay } = load("redemption-sync");
  assert.equal(redemptionRetryDelay(1), 60000);
  assert.equal(redemptionRetryDelay(2), 120000);
  assert.equal(redemptionRetryDelay(30), 3600000);
  const diagnostic = safeSyncDetail('Error api_key=abc123 password=secret https://example.com?token=hidden longtoken012345678901234567890123456', ['secret', 'abc123']);
  for (const secret of ['secret', 'abc123', 'hidden', 'longtoken012345678901234567890123456']) assert.ok(!diagnostic.includes(secret));
  assert.ok(safeSyncDetail('x'.repeat(600), []).length <= 300);
  assert.ok(!safeSyncDetail(JSON.stringify({ Message: 'a"b c' }), ['a"b c']).includes('a\\"b'));
});

test("durable redemption sync retries safely, reuses remote users, and never changes entitlement", { skip: process.env.RUN_REDEMPTION_DB_TESTS !== "1" }, async () => {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname));
  const { enqueueRedemptionSync, syncRedeemedSubscription } = load("redemption-sync");
  const { encryptString } = load("crypto");
  const originalFetch = globalThis.fetch;
  const password = 'FixturePassword123';
  const encrypted = encryptString(password);
  const users = [], servers = [], plans = [], cards = [];
  const remoteUsers = new Map();
  let createCalls = 0, failCreate = true, lostResponse = false, failPassword = false;
  const logs = [], originalWarn = console.warn;
  console.warn = (...args) => logs.push(args);
  globalThis.fetch = async (url, options = {}) => {
    assert.ok(String(url).startsWith('http://127.0.0.1:1/'), "Never call a real Emby server");
    assert.equal(options.headers['X-Emby-Token'], 'fixtureApiKey');
    assert.ok(!String(url).includes('api_key='));
    const path = new URL(url).pathname;
    const data = options.body ? JSON.parse(options.body) : null;
    const reply = (value, status = 200) => new Response(value === null ? null : JSON.stringify(value), { status });
    if (path === '/Users' && !options.body) return reply([...remoteUsers.values()]);
    if (path === '/Users/New') {
      createCalls++;
      if (failCreate) return reply({ Message: 'upstream refused fixtureApiKey ' + password }, 503);
      const user = { Id: 'remote-' + data.Name, Name: data.Name, Policy: { IsAdministrator: false, IsDisabled: false } };
      remoteUsers.set(user.Id, user);
      if (lostResponse) { lostResponse = false; throw new Error('lost response'); }
      return reply(user);
    }
    if (path === '/Users/template') return reply({ Id: 'template', Policy: { IsAdministrator: true, IsDisabled: true, EnableMediaPlayback: true, EnabledFolders: ['fixture-library'] } });
    const [, , id, operation] = path.split('/');
    const user = remoteUsers.get(id);
    if (!user) return reply({ Message: 'not found' }, 404);
    if (operation === 'Policy') { user.Policy = data; return reply(null, 204); }
    if (operation === 'Password') {
      assert.equal(data.NewPw, password);
      return failPassword ? reply({ Message: password }, 500) : reply(null, 204);
    }
    return reply(user);
  };
  try {
    const plan = await db.plan.create({ data: { name: 'redemption_sync_fixture', enabled: false, visible: false, serverAssignStrategy: 'ALL' } }); plans.push(plan.id);
    const server = await db.embyServer.create({ data: { name: 'redemption_sync_fixture', baseUrl: 'http://127.0.0.1:1', apiKey: 'fixtureApiKey' } }); servers.push(server.id);
    await db.planServerConfig.create({ data: { planId: plan.id, embyServerId: server.id, templateEmbyUserId: 'template' } });
    const makeSub = async () => {
      const user = await db.user.create({ data: { username: 'redemption_test_' + crypto.randomUUID(), passwordHash: 'fixture', syncPasswordEnc: encrypted.enc, syncPasswordIv: encrypted.iv, syncPasswordTag: encrypted.tag } }); users.push(user.id);
      const sub = await db.subscription.create({ data: { userId: user.id, planId: plan.id, startAt: new Date(), endAt: new Date(Date.now() + 365 * 86400000) } });
      return { user, sub };
    };
    const { user, sub } = await makeSub();
    // Simulate a crash before commit: entitlement changes and queue insertion roll back together.
    await assert.rejects(db.$transaction(async tx => {
      await enqueueRedemptionSync(tx, sub.id);
      await tx.subscription.update({ where: { id: sub.id }, data: { endAt: new Date(0) } });
      throw new Error('rollback fixture');
    }));
    assert.equal(await db.redemptionSyncJob.count({ where: { subscriptionId: sub.id } }), 0);
    const job = await db.$transaction(tx => enqueueRedemptionSync(tx, sub.id));
    assert.equal(await syncRedeemedSubscription(job.id), false);
    const failed = await db.redemptionSyncJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(failed.status, 'PENDING'); assert.equal(failed.attempts, 1);
    assert.ok(failed.lastError.issues, JSON.stringify(failed.lastError));
    assert.equal(failed.lastError.issues[0].stage, 'create_user');
    assert.equal(failed.lastError.issues[0].status, 503);
    assert.ok(failed.nextAttemptAt > new Date());
    assert.ok(!JSON.stringify(failed.lastError).includes(password));
    assert.ok(!JSON.stringify(logs).includes('fixtureApiKey'));
    assert.equal(await db.subscriptionServer.count({ where: { subscriptionId: sub.id, embyServerId: server.id } }), 1);
    // Delay survives between invocations, rather than retrying on every request.
    const calls = createCalls;
    assert.equal(await syncRedeemedSubscription(job.id), false); assert.equal(createCalls, calls);
    failCreate = false; lostResponse = true;
    await db.redemptionSyncJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
    const results = await Promise.all([syncRedeemedSubscription(job.id), syncRedeemedSubscription(job.id)]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(createCalls, calls + 1);
    const done = await db.redemptionSyncJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(done.status, 'DONE'); assert.equal(done.attempts, 2);
    const link = await db.embyUserLink.findFirstOrThrow({ where: { userId: user.id, embyServerId: server.id } });
    assert.equal(link.disabled, false);
    assert.deepEqual(remoteUsers.get(link.embyUserId).Policy, { IsAdministrator: false, IsDisabled: false, EnableMediaPlayback: true, EnabledFolders: ['fixture-library'] });
    const unchanged = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    assert.equal(unchanged.endAt.getTime(), sub.endAt.getTime()); assert.equal(unchanged.planId, plan.id);
    assert.equal(await syncRedeemedSubscription(job.id), false);
    // Requeue after a later redemption; an existing remote account is reused.
    failPassword = true;
    const requeued = await db.$transaction(tx => enqueueRedemptionSync(tx, sub.id));
    assert.equal(requeued.id, job.id);
    assert.equal(await syncRedeemedSubscription(job.id), false);
    assert.equal(createCalls, calls + 1);
    assert.equal(remoteUsers.get(link.embyUserId).Policy.IsDisabled, true);
    failPassword = false;
    await db.redemptionSyncJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
    assert.equal(await syncRedeemedSubscription(job.id), true);
    assert.equal(createCalls, calls + 1);
    // Canceled/expired/disabled subscriptions must not provision accounts.
    const inactive = await makeSub();
    const inactiveJob = await db.$transaction(tx => enqueueRedemptionSync(tx, inactive.sub.id));
    await db.subscription.update({ where: { id: inactive.sub.id }, data: { status: 'CANCELED' } });
    assert.equal(await syncRedeemedSubscription(inactiveJob.id), false);
    assert.equal((await db.redemptionSyncJob.findUniqueOrThrow({ where: { id: inactiveJob.id } })).status, 'CANCELED');
    assert.equal(createCalls, calls + 1);
    // Penalty checks must not enable a blocked account.
    const blocked = await makeSub();
    await db.subscriptionServer.create({ data: { subscriptionId: blocked.sub.id, embyServerId: server.id } });
    const penaltyKey = 'anomaly_penalty_records';
    const originalPenalty = await db.appSetting.findUnique({ where: { key: penaltyKey } });
    try {
      await db.appSetting.upsert({ where: { key: penaltyKey }, create: { key: penaltyKey, valueJson: [{ userId: blocked.user.id, embyServerId: server.id, status: 'PENDING' }] }, update: { valueJson: [...(Array.isArray(originalPenalty?.valueJson) ? originalPenalty.valueJson : []), { userId: blocked.user.id, embyServerId: server.id, status: 'PENDING' }] } });
      const blockedJob = await db.$transaction(tx => enqueueRedemptionSync(tx, blocked.sub.id));
      assert.equal(await syncRedeemedSubscription(blockedJob.id), false);
      assert.equal((await db.redemptionSyncJob.findUniqueOrThrow({ where: { id: blockedJob.id } })).lastError.issues[0].stage, 'penalty_active');
      assert.equal(createCalls, calls + 1);
    } finally {
      if (originalPenalty) await db.appSetting.update({ where: { key: penaltyKey }, data: { valueJson: originalPenalty.valueJson } });
      else await db.appSetting.delete({ where: { key: penaltyKey } });
    }
    // Exercise the actual redemption handler, including card consumption and durable enqueue.
    const buyer = await makeSub();
    const code = crypto.randomUUID().replaceAll('-', '').toUpperCase();
    const card = await db.cardCode.create({ data: { code, type: 'SUBSCRIPTION', planId: plan.id, subscriptionDays: 365, payCycle: 'YEARLY' } }); cards.push(card.id);
    const routeSource = readFileSync(new URL('../src/app/api/portal/redeem/route.ts', import.meta.url), 'utf8');
    const routeCode = ts.transpileModule(routeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const route = { exports: {} };
    let routeUsername = buyer.user.username;
    let activeCode = code;
    new Function('module', 'exports', 'require', routeCode)(route, route.exports, (path) => {
      if (path === 'next-auth') return { getServerSession: async () => ({ username: routeUsername }) };
      if (path === '@/lib/auth') return { authOptions: {} };
      return path.startsWith('@/lib/') ? load(path.slice(6)) : require(path);
    });
    failCreate = true;
    const redeem = () => route.exports.POST(new Request('http://localhost/api/portal/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: activeCode }) }));
    const response = await redeem();
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.warn, 'redeem_subscription_sync_partial');
    assert.ok(payload.result.syncJobId);
    assert.equal((await db.cardCode.findUniqueOrThrow({ where: { id: card.id } })).status, 'USED');
    const afterRedeem = await db.subscription.findUniqueOrThrow({ where: { id: buyer.sub.id } });
    assert.equal(afterRedeem.endAt.getTime(), buyer.sub.endAt.getTime() + 365 * 86400000);
    assert.equal((await db.redemptionSyncJob.findUniqueOrThrow({ where: { id: payload.result.syncJobId } })).status, 'PENDING');
    assert.equal((await redeem()).status, 400);
    failCreate = false;
    await db.redemptionSyncJob.update({ where: { id: payload.result.syncJobId }, data: { nextAttemptAt: new Date(0) } });
    assert.equal(await syncRedeemedSubscription(payload.result.syncJobId), true);
    assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: buyer.sub.id } })).endAt.getTime(), afterRedeem.endAt.getTime());
    assert.equal((await db.cardCode.findUniqueOrThrow({ where: { id: card.id } })).usedByUserId, buyer.user.id);
    const fresh = await makeSub();
    await db.subscription.delete({ where: { id: fresh.sub.id } });
    routeUsername = fresh.user.username;
    activeCode = crypto.randomUUID().replaceAll('-', '').toUpperCase();
    const freshCard = await db.cardCode.create({ data: { code: activeCode, type: 'SUBSCRIPTION', planId: plan.id, subscriptionDays: 365, payCycle: 'YEARLY' } }); cards.push(freshCard.id);
    const freshResponse = await redeem();
    assert.equal(freshResponse.status, 200);
    assert.equal((await freshResponse.json()).warn, undefined);
    const freshSub = await db.subscription.findFirstOrThrow({ where: { userId: fresh.user.id } });
    assert.equal(freshSub.endAt - freshSub.startAt, 365 * 86400000);
    assert.equal((await db.redemptionSyncJob.findUniqueOrThrow({ where: { subscriptionId: freshSub.id } })).status, 'DONE');
    activeCode = crypto.randomUUID().replaceAll('-', '').toUpperCase();
    const balanceCard = await db.cardCode.create({ data: { code: activeCode, type: 'BALANCE', amountCents: 1234 } }); cards.push(balanceCard.id);
    const balanceResponse = await redeem();
    assert.equal(balanceResponse.status, 200);
    assert.equal((await balanceResponse.json()).result.syncJobId, null);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: fresh.user.id } })).balanceCents, 1234);
    assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: freshSub.id } })).endAt.getTime(), freshSub.endAt.getTime());
  } finally {
    globalThis.fetch = originalFetch; console.warn = originalWarn;
    await db.cardCode.deleteMany({ where: { id: { in: cards } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.plan.deleteMany({ where: { id: { in: plans } } });
    await db.embyServer.deleteMany({ where: { id: { in: servers } } });
  }
});

test.after(() => db.$disconnect());
