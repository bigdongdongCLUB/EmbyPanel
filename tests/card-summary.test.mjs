import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/api/admin/card-codes/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

async function summaryAt(now, fallback = false) {
  const ranges = [];
  const count = async ({ where } = {}) => {
    if (!where?.usedAt) return 0;
    ranges.push({ type: where.type, start: where.usedAt.gte.toISOString(), end: where.usedAt.lt.toISOString() });
    return where.type === "BALANCE" ? 7 : 11;
  };
  const prisma = {
    plan: { findMany: async () => [] },
    cardCode: fallback ? undefined : { findMany: async () => [], count },
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      if (sql.includes("LEFT JOIN")) return [];
      if (sql.includes('"usedAt"')) {
        const type = sql.includes("'BALANCE'") ? "BALANCE" : "SUBSCRIPTION";
        return [{ c: await count({ where: { type, usedAt: { gte: values[0], lt: values[1] } } }) }];
      }
      return [{ c: 0 }];
    },
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
  }
  const testModule = { exports: {} };
  const deps = {
    "next/server": { NextResponse: { json: (body) => body } },
    "@prisma/client": {},
    zod: { z: (await import("zod")).z },
    "@/lib/admin": { requireAdmin: async () => ({ ok: true }) },
    "@/lib/db": { prisma },
  };
  new Function("exports", "require", "Date", compiled)(testModule.exports, (name) => {
    assert.ok(name in deps, `Unexpected dependency: ${name}`);
    return deps[name];
  }, FixedDate);
  const result = await testModule.exports.GET(new Request("http://localhost/api/admin/card-codes"));
  assert.equal(result.ok, true);
  assert.equal(result.summary.balanceLastMonthUsed, 7);
  assert.equal(result.summary.subLastMonthUsed, 11);
  return ranges;
}

for (const fallback of [false, true]) {
  test(`last month counts use Shanghai calendar boundaries (${fallback ? "SQL fallback" : "Prisma"})`, async () => {
    const ranges = await summaryAt("2026-10-31T16:00:00Z", fallback);
    assert.equal(ranges.length, 4);
    for (const range of ranges.slice(0, 2)) {
      assert.equal(range.start, "2026-10-31T16:00:00.000Z");
      assert.equal(range.end, "2026-11-30T16:00:00.000Z");
    }
    for (const range of ranges.slice(2)) {
      assert.equal(range.start, "2026-09-30T16:00:00.000Z");
      assert.equal(range.end, "2026-10-31T16:00:00.000Z");
    }
  });
}

test("last month crosses year and leap-year boundaries", async () => {
  const january = await summaryAt("2027-01-15T00:00:00Z");
  assert.equal(january[2].start, "2026-11-30T16:00:00.000Z");
  assert.equal(january[2].end, "2026-12-31T16:00:00.000Z");
  const march = await summaryAt("2028-03-01T00:00:00Z");
  assert.equal(march[2].start, "2028-01-31T16:00:00.000Z");
  assert.equal(march[2].end, "2028-02-29T16:00:00.000Z");
});
