import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import * as stream from "node:stream";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/api/admin/users/export/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;

function exportRoute(auth, findMany) {
  const deps = {
    exceljs: ExcelJS,
    "node:stream": stream,
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/admin": { requireAdmin: async () => auth },
    "@/lib/db": { prisma: { user: { findMany } } },
    "@/lib/password": { verifyPassword: (candidate, hash) => bcrypt.compare(candidate, hash) },
  };
  const output = {};
  new Function("exports", "require", compiled)(output, (name) => deps[name]);
  return output.GET;
}

const request = new Request("http://localhost/api/admin/users/export");

test("admin export only includes active plans with a future expiry, and only exposes a default-password flag", async () => {
  const createdAt = new Date("2026-11-02T16:00:00Z");
  const expiry = new Date("2099-01-01T00:00:00Z");
  const past = new Date("2000-01-01T00:00:00Z");
  const defaultHash = await bcrypt.hash("test1234", 4);
  const otherHash = await bcrypt.hash("different-password", 4);
  const get = exportRoute({ ok: true }, async (query) => {
    const { gt: now } = query.where.subscriptions.some.endAt;
    assert.ok(now instanceof Date);
    const activeSubscription = { status: "ACTIVE", planId: { not: null }, endAt: { gt: now } };
    assert.deepEqual(query.where, { subscriptions: { some: activeSubscription } });
    assert.equal(query.take, undefined);
    assert.deepEqual(Object.keys(query.select).sort(), [
      "createdAt", "email", "maxConcurrentPlaybacks", "maxConcurrentPlaybacksExpiresAt", "passwordHash", "subscriptions", "username",
    ]);
    assert.deepEqual(query.select.subscriptions.where, activeSubscription);
    assert.equal(query.select.subscriptions.take, 1);
    return [
      { username: "00123", passwordHash: defaultHash, email: "user@example.test", maxConcurrentPlaybacks: 0, maxConcurrentPlaybacksExpiresAt: expiry, createdAt, subscriptions: [{ endAt: expiry }] },
      { username: "=1+1", passwordHash: otherHash, email: null, maxConcurrentPlaybacks: 5, maxConcurrentPlaybacksExpiresAt: past, createdAt, subscriptions: [{ endAt: expiry }] },
    ];
  });
  const response = await get(request);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("content-disposition"), /attachment;.*\.xlsx/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.columnCount, 6);
  assert.equal(sheet.getCell("F1").value, "是否使用默认密码");
  assert.equal(sheet.getCell("A2").value, "00123");
  assert.equal(sheet.getCell("C2").value, 0);
  assert.equal(sheet.getCell("D2").value, createdAt.toISOString());
  assert.equal(sheet.getCell("E2").value, expiry.toISOString());
  assert.equal(sheet.getCell("F2").value, "是");
  assert.equal(sheet.getCell("A3").value, "=1+1");
  assert.equal(sheet.getCell("C3").value, 1);
  assert.equal(sheet.getCell("F3").value, "否");
  sheet.eachRow((row) => {
    const values = JSON.stringify(row.values);
    assert.ok(!values.includes(defaultHash) && !values.includes(otherHash) && !values.includes("test1234"));
  });
});

test("non-admin requests never query the user table", async () => {
  for (const [status, error] of [[401, "unauthorized"], [403, "forbidden"]]) {
    const get = exportRoute({ ok: false, status, error }, () => assert.fail("Unexpected user query"));
    assert.equal((await get(request)).status, status);
  }
});
