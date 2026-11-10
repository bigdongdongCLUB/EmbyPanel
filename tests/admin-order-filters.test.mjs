import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/api/admin/orders/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function orderRoute(auth = { ok: true }) {
  const calls = { counts: [], lists: [], plans: [] };
  const planOptions = [{ id: "retired-plan", name: "Old plan" }];
  const deps = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/admin": { requireAdmin: async () => auth },
    "@/lib/order-expiry": { autoCancelExpiredPendingOrders: async () => {} },
    "@/lib/db": {
      prisma: {
        serviceOrder: {
          count: async ({ where }) => { calls.counts.push(where); return where.planId ? 12 : 42; },
          aggregate: async () => ({ _sum: { amountCents: 47500 } }),
          findMany: async (query) => { calls.lists.push(query); return []; },
        },
        plan: { findMany: async (query) => { calls.plans.push(query); return planOptions; } },
      },
    },
  };
  const output = {};
  new Function("exports", "require", compiled)(output, (name) => deps[name]);
  return {
    calls,
    planOptions,
    get: (params = {}) => output.GET(new Request(`http://localhost/api/admin/orders?${new URLSearchParams(params)}`)),
  };
}

test("username, status and plan filters combine before pagination, without changing summary totals", async () => {
  const { get, calls, planOptions } = orderRoute();
  const res = await get({ username: "  User_1%  ", status: "PAID", planId: "retired-plan", page: "2", pageSize: "10" });
  assert.equal(res.status, 200);
  const body = await res.json();
  const [rangeWhere, paidWhere, pendingWhere, listWhere] = calls.counts;
  assert.deepEqual(paidWhere, { ...rangeWhere, status: "PAID" });
  assert.deepEqual(pendingWhere, { ...rangeWhere, status: "PENDING" });
  assert.deepEqual(listWhere, {
    ...rangeWhere,
    user: { username: { contains: "User\\_1\\%", mode: "insensitive" } },
    status: "PAID",
    planId: "retired-plan",
  });
  assert.deepEqual(calls.lists[0].where, listWhere);
  assert.equal(calls.lists[0].skip, 10);
  assert.equal(calls.lists[0].take, 10);
  assert.equal(body.summary.totalOrders, 42);
  assert.deepEqual(body.pagination, { page: 2, pageSize: 10, total: 12, totalPages: 2 });
  assert.deepEqual(body.plans, planOptions);
  assert.equal(calls.plans[0].where, undefined);
});

test("blank filters preserve the unfiltered list and default page size", async () => {
  const { get, calls } = orderRoute();
  const body = await (await get({ username: " ", status: "", planId: "" })).json();
  assert.deepEqual(calls.lists[0].where, calls.counts[0]);
  assert.deepEqual(body.pagination, { page: 1, pageSize: 10, total: 42, totalPages: 5 });
});

test("invalid statuses and unauthorized requests do not query orders", async () => {
  const admin = orderRoute();
  const invalid = await admin.get({ status: "REFUNDED" });
  assert.equal(invalid.status, 400);
  assert.equal(admin.calls.counts.length, 0);
  const anonymous = orderRoute({ ok: false, status: 401, error: "unauthorized" });
  assert.equal((await anonymous.get({ username: "user" })).status, 401);
  assert.equal(anonymous.calls.lists.length, 0);
});
