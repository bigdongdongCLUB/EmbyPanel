import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/lib/vod-points.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const testModule = { exports: {} };
new Function("module", "exports", "require", compiled)(testModule, testModule.exports, require);
const { vodPointCost, vodPointPeriod, getVodPoints, settleVodPoints, monthlyVodPointsSetting } = testModule.exports;

test("pricing includes both year boundaries and caps missing years", () => {
  for (const [year, expected] of [["2015", 10], ["2014", 20], ["2005", 20], ["2004", 30], [null, 30], ["invalid", 30]]) {
    assert.equal(vodPointCost("TV", year), expected);
    assert.equal(vodPointCost("MOVIE", year), 10);
  }
});

test("library matching is movie-specific or selected-season-specific", () => {
  const source = readFileSync(new URL("../src/lib/vod-library-status.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const libraryModule = { exports: {} };
  new Function("module", "exports", "require", compiled)(libraryModule, libraryModule.exports, require);
  const { isVodContentInLibrary } = libraryModule.exports;
  const results = [{ hasMovie: true, seasons: { 1: true, 2: false } }];
  assert.equal(isVodContentInLibrary("MOVIE", results), true);
  assert.equal(isVodContentInLibrary("MOVIE", [{ hasMovie: false, seasons: { 1: true } }]), false);
  assert.equal(isVodContentInLibrary("TV", results, 1), true);
  assert.equal(isVodContentInLibrary("TV", results, 2), false);
  assert.equal(isVodContentInLibrary("TV", results), false);
});

test("monthly reset uses Shanghai midnight, including year rollover and leap February", () => {
  assert.deepEqual(vodPointPeriod(new Date("2026-10-31T15:59:59Z")), { month: "2026-10", nextReset: "2026-10-31T16:00:00.000Z" });
  assert.deepEqual(vodPointPeriod(new Date("2026-10-31T16:00:00Z")), { month: "2026-11", nextReset: "2026-11-30T16:00:00.000Z" });
  assert.deepEqual(vodPointPeriod(new Date("2026-12-31T16:00:00Z")), { month: "2027-01", nextReset: "2027-01-31T16:00:00.000Z" });
  assert.deepEqual(vodPointPeriod(new Date("2028-02-01T00:00:00Z")), { month: "2028-02", nextReset: "2028-02-29T16:00:00.000Z" });
});

test("database settlement: reservation, idempotent charge, refund, rollover and insufficient funds", { skip: process.env.RUN_VOD_POINTS_DB_TESTS !== "1" }, async () => {
  require("dotenv/config");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const rollback = new Error("test_rollback");
  const now = new Date("2026-10-13T12:00:00Z");
  const nextMonth = new Date("2026-11-01T00:00:00Z");
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { username: `points_test_${crypto.randomUUID()}`, passwordHash: "test" } });
      const id = `request_${crypto.randomUUID()}`;
      await tx.vodPointEntry.create({ data: { requestId: id, userId: user.id, cost: 20, month: "2026-10", state: "RESERVED" } });
      assert.equal((await getVodPoints(tx, user.id, now)).available, 280);
      await settleVodPoints(tx, [id], true, false, now);
      await settleVodPoints(tx, [id], true, false, now);
      assert.deepEqual(await getVodPoints(tx, user.id, now), { month: "2026-10", nextReset: "2026-10-31T16:00:00.000Z", total: 300, charged: 20, reserved: 0, available: 280 });
      assert.equal((await getVodPoints(tx, user.id, nextMonth)).available, 300);
      await settleVodPoints(tx, [id], false, false, nextMonth);
      assert.equal((await getVodPoints(tx, user.id, now)).available, 280);
      await settleVodPoints(tx, [id], false, false, now);
      assert.equal((await getVodPoints(tx, user.id, now)).available, 300);
      assert.equal((await getVodPoints(tx, user.id, nextMonth)).available, 300);
      await tx.vodRequest.create({ data: { id, userId: user.id, tmdbId: 1, mediaType: "TV", title: "test", titleOriginal: "test", bizStatus: "PENDING" } });
      await settleVodPoints(tx, [id], false, true, now, "PENDING");
      assert.equal((await getVodPoints(tx, user.id, now)).reserved, 0);
      await settleVodPoints(tx, [id], false, true, now);
      assert.equal((await getVodPoints(tx, user.id, now)).reserved, 20);
      await settleVodPoints(tx, [id], true, false, nextMonth);
      assert.equal((await getVodPoints(tx, user.id, nextMonth)).charged, 0);
      const spent = Array.from({ length: 15 }, () => ({ requestId: crypto.randomUUID(), userId: user.id, cost: 20, month: "2026-11", state: "CHARGED" }));
      await tx.vodPointEntry.createMany({ data: spent });
      const waitingId = crypto.randomUUID();
      await tx.vodPointEntry.create({ data: { requestId: waitingId, userId: user.id, cost: 10, month: "2026-10", state: "RESERVED" } });
      await settleVodPoints(tx, [waitingId], true, false, nextMonth);
      await settleVodPoints(tx, [waitingId], false, false, nextMonth);
      const currentId = crypto.randomUUID();
      await tx.vodPointEntry.create({ data: { requestId: currentId, userId: user.id, cost: 10, month: "2026-11", state: "RELEASED" } });
      await assert.rejects(settleVodPoints(tx, [currentId], true, false, nextMonth), /vod_points_insufficient/);
      assert.equal((await tx.vodPointEntry.findUnique({ where: { requestId: waitingId } })).state, "RESERVED");
      assert.equal((await getVodPoints(tx, user.id, nextMonth)).available, 0);
      const freeId = crypto.randomUUID();
      await tx.vodPointEntry.create({ data: { requestId: freeId, userId: user.id, cost: 0, month: "2026-11", state: "RELEASED" } });
      await settleVodPoints(tx, [freeId], true, false, nextMonth);
      await settleVodPoints(tx, [freeId], false, false, nextMonth);
      await settleVodPoints(tx, [freeId], false, true, nextMonth);
      assert.equal((await getVodPoints(tx, user.id, nextMonth)).available, 0);
      assert.equal((await tx.vodPointEntry.findUnique({ where: { requestId: freeId } })).cost, 0);
      // Legacy requests have no ledger entry and are never charged retroactively.
      await settleVodPoints(tx, ["legacy_request"], true, false, nextMonth);
      throw rollback;
    }, { timeout: 15000 }), (error) => error === rollback);
  } finally {
    await prisma.$disconnect();
  }
});

test("a group settlement with insufficient funds rolls back every user's entry", { skip: process.env.RUN_VOD_POINTS_DB_TESTS !== "1" }, async () => {
  require("dotenv/config");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  const usernames = ids.map((id) => `points_rollback_${id}`);
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const first = await tx.user.create({ data: { username: usernames[0], passwordHash: "test" } });
      const second = await tx.user.create({ data: { username: usernames[1], passwordHash: "test" } });
      await tx.vodPointEntry.createMany({ data: [
        { requestId: ids[0], userId: first.id, cost: 10, month: "2026-11", state: "RELEASED" },
        { requestId: ids[1], userId: second.id, cost: 10, month: "2026-11", state: "RELEASED" },
        ...Array.from({ length: 10 }, () => ({ requestId: crypto.randomUUID(), userId: second.id, cost: 30, month: "2026-11", state: "CHARGED" })),
      ] });
      await settleVodPoints(tx, ids, true, false, new Date("2026-11-01T00:00:00Z"));
    }), /vod_points_insufficient/);
    assert.equal(await prisma.vodPointEntry.count({ where: { requestId: { in: ids } } }), 0);
    assert.equal(await prisma.user.count({ where: { username: { in: usernames } } }), 0);
  } finally {
    await prisma.$disconnect();
  }
});


test("monthly configuration validates defaults and accepts zero", () => {
  assert.equal(monthlyVodPointsSetting(undefined), 300);
  assert.equal(monthlyVodPointsSetting(500), 500);
  assert.equal(monthlyVodPointsSetting(0), 0);
  for (const value of [-1, 1.5, "500", 100001, null]) assert.equal(monthlyVodPointsSetting(value), 300);
});

test("configured balance retains spending and reservation when allowance changes", { skip: process.env.RUN_VOD_POINTS_DB_TESTS !== "1" }, async () => {
  require("dotenv/config");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const rollback = new Error("configuration_test_rollback");
  const now = new Date("2026-10-13T12:00:00Z");
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { username: `points_config_${crypto.randomUUID()}`, passwordHash: "test" } });
      const reservedId = crypto.randomUUID();
      await tx.vodPointEntry.createMany({ data: [
        ...Array.from({ length: 10 }, () => ({ requestId: crypto.randomUUID(), userId: user.id, cost: 10, month: "2026-10", state: "CHARGED" })),
        { requestId: reservedId, userId: user.id, cost: 20, month: "2026-10", state: "RESERVED" },
      ] });
      for (const [total, available] of [[500, 380], [200, 80], [0, 0]]) {
        await tx.appSetting.upsert({ where: { key: "vod_settings" }, create: { key: "vod_settings", valueJson: { monthlyInitialPoints: total } }, update: { valueJson: { monthlyInitialPoints: total } } });
        const balance = await getVodPoints(tx, user.id, now);
        assert.equal(balance.total, total);
        assert.equal(balance.available, available);
        assert.equal(balance.charged, 100);
        assert.equal(balance.reserved, 20);
      }
      await assert.rejects(settleVodPoints(tx, [reservedId], true, false, now), /vod_points_insufficient/);
      throw rollback;
    }), (error) => error === rollback);
  } finally { await prisma.$disconnect(); }
});
