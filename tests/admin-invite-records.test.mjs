import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/api/admin/invites/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function inviteRoute(requireAdmin) {
  const deps = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/admin": { requireAdmin },
    "@/lib/db": {
      prisma: {
        appSetting: { findUnique: async ({ where }) => {
          assert.equal(where.key, "invite_relations");
          return { valueJson: {
            older: { inviterUserId: "missing", createdAt: "2026-10-01T00:00:00Z" },
            newest: { inviterUserId: "owner", inviteCode: "not-for-display", createdAt: "2026-11-12T13:21:51.357Z" },
            invalid: null,
          } };
        } },
        user: { findMany: async ({ where }) => {
          assert.deepEqual(new Set(where.id.in), new Set(["older", "missing", "newest", "owner"]));
          return [{ id: "owner", username: "inviter" }, { id: "newest", username: "invitee" }];
        } },
      },
    },
  };
  const output = {};
  new Function("exports", "require", compiled)(output, (name) => deps[name]);
  const settings = deps["@/lib/db"].prisma.appSetting;
  const readRelations = settings.findUnique;
  settings.findUnique = (query) => query.where.key === "invite_rebate_records" ? Promise.resolve(null) : readRelations(query);
  return output.GET;
}

test("saved invitation relationships are listed newest first without rebate records", async () => {
  const get = inviteRoute(async () => ({ ok: true }));
  const body = await (await get()).json();
  assert.deepEqual(body.rows, []);
  assert.deepEqual(body.inviteRows, [
    { id: "newest", inviter: "inviter", invited: "invitee", createdAt: "2026-11-12T13:21:51.357Z" },
    { id: "older", inviter: "missing", invited: "older", createdAt: "2026-10-01T00:00:00.000Z" },
  ]);
});

test("invitation records remain admin-only", async () => {
  const get = inviteRoute(async () => ({ ok: false, status: 403, error: "forbidden" }));
  const res = await get();
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "forbidden" });
});
