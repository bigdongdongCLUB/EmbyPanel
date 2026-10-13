import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/lib/vod-daily-limit.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const testModule = { exports: {} };
new Function("module", "exports", "require", compiled)(testModule, testModule.exports, require);
const { dailyVodSubmissionSetting, vodSubmissionDay, getDailyVodSubmissions, recordDeletedVodSubmission } = testModule.exports;

test("daily submission setting defaults to three and validates integers", () => {
  assert.equal(dailyVodSubmissionSetting(undefined), 3);
  assert.equal(dailyVodSubmissionSetting(5), 5);
  for (const value of [0, -1, 1.5, "5", 1001]) assert.equal(dailyVodSubmissionSetting(value), 3);
});

test("day boundary is Shanghai midnight", () => {
  assert.equal(vodSubmissionDay(new Date("2026-10-13T15:59:59Z")).start.toISOString(), "2026-10-12T16:00:00.000Z");
  assert.equal(vodSubmissionDay(new Date("2026-10-13T16:00:00Z")).start.toISOString(), "2026-10-13T16:00:00.000Z");
});

test("paid, free and legacy requests each count once and deletion does not restore new submissions", { skip: process.env.RUN_VOD_POINTS_DB_TESTS !== "1" }, async () => {
  require("dotenv/config");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const rollback = new Error("daily_test_rollback");
  const now = new Date("2026-10-13T12:00:00Z");
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({ where: { key: "vod_settings" }, create: { key: "vod_settings", valueJson: { dailySubmissionLimit: 3 } }, update: { valueJson: { dailySubmissionLimit: 3 } } });
      const user = await tx.user.create({ data: { username: `daily_test_${crypto.randomUUID()}`, passwordHash: "test" } });
      const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      for (const id of ids) await tx.vodRequest.create({ data: { id, userId: user.id, tmdbId: 1, mediaType: "MOVIE", title: "test", titleOriginal: "test", createdAt: now } });
      await tx.vodPointEntry.createMany({ data: [
        { requestId: ids[0], userId: user.id, cost: 10, month: "2026-10", state: "RESERVED", createdAt: now },
        { requestId: ids[1], userId: user.id, cost: 0, month: "2026-10", state: "RELEASED", createdAt: now },
        { requestId: crypto.randomUUID(), userId: user.id, cost: 10, month: "2026-10", state: "CHARGED", createdAt: new Date("2026-10-12T15:59:59Z") },
      ] });
      assert.equal((await getDailyVodSubmissions(tx, user.id, now)).dailyUsed, 3);
      assert.equal((await getDailyVodSubmissions(tx, user.id, now)).dailyRemaining, 0);
      await tx.vodRequest.update({ where: { id: ids[0] }, data: { userDeletedAt: now } });
      await tx.vodRequest.delete({ where: { id: ids[1] } });
      assert.equal((await getDailyVodSubmissions(tx, user.id, now)).dailyRemaining, 0);
      assert.equal((await getDailyVodSubmissions(tx, user.id, new Date("2026-10-13T16:00:00Z"))).dailyRemaining, 3);
      await tx.appSetting.update({ where: { key: "vod_settings" }, data: { valueJson: { dailySubmissionLimit: 5 } } });
      assert.equal((await getDailyVodSubmissions(tx, user.id, now)).dailyRemaining, 2);
      throw rollback;
    }), (error) => error === rollback);
  } finally { await prisma.$disconnect(); }
});


test("only deletion in pending state restores the daily slot, including free and legacy requests", { skip: process.env.RUN_VOD_POINTS_DB_TESTS !== "1" }, async () => {
  require("dotenv/config");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const rollback = new Error("release_test_rollback");
  const now = new Date("2026-10-13T12:00:00Z");
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { username: `daily_release_${crypto.randomUUID()}`, passwordHash: "test" } });
      const states = ["PENDING", "PENDING", "PROCESSING", "NO_RESOURCE", "CANNOT_UPDATE", "COMPLETED"];
      const rows = [];
      for (const [index, bizStatus] of states.entries()) {
        const row = await tx.vodRequest.create({ data: { userId: user.id, tmdbId: 1, mediaType: "MOVIE", title: "test", titleOriginal: "test", createdAt: now, bizStatus } });
        rows.push(row);
        await tx.vodPointEntry.create({ data: { requestId: row.id, userId: user.id, cost: index === 0 ? 0 : 10, month: "2026-10", state: "RELEASED", createdAt: now } });
      }
      assert.equal((await getDailyVodSubmissions(tx, user.id, now)).dailyUsed, 6);
      for (const row of rows) {
        await recordDeletedVodSubmission(tx, row);
        await tx.vodRequest.update({ where: { id: row.id }, data: { userDeletedAt: now } });
      }
      assert.equal((await getDailyVodSubmissions(tx, user.id, now)).dailyUsed, 4);
      await tx.vodRequest.update({ where: { id: rows[0].id }, data: { bizStatus: "COMPLETED" } });
      await tx.vodRequest.delete({ where: { id: rows[1].id } });
      assert.equal((await getDailyVodSubmissions(tx, user.id, now)).dailyUsed, 4);
      const legacy = await tx.vodRequest.create({ data: { userId: user.id, tmdbId: 2, mediaType: "MOVIE", title: "legacy", titleOriginal: "legacy", createdAt: now } });
      assert.equal((await getDailyVodSubmissions(tx, user.id, now)).dailyUsed, 5);
      await recordDeletedVodSubmission(tx, legacy);
      await tx.vodRequest.update({ where: { id: legacy.id }, data: { userDeletedAt: now } });
      assert.equal((await getDailyVodSubmissions(tx, user.id, now)).dailyUsed, 4);
      throw rollback;
    }), (error) => error === rollback);
  } finally { await prisma.$disconnect(); }
});
