import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);

test("latest requester updates unfinished peers only, while completed entries and other seasons remain intact", { skip: process.env.RUN_VOD_API_TESTS !== "1" }, async () => {
  require("dotenv/config");
  const { PrismaClient } = require("@prisma/client");
  const { encode } = require("next-auth/jwt");
  const prisma = new PrismaClient();
  const users = [];
  const now = new Date();
  const local = new Date(now.getTime() + 8 * 3600 * 1000);
  const month = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
  const tmdbId = 1500000000 + Math.floor(Math.random() * 100000000);
  try {
    const states = ["COMPLETED", "NO_RESOURCE", "PROCESSING", "PENDING"];
    const rows = [];
    for (const [index, bizStatus] of states.entries()) {
      const user = await prisma.user.create({ data: { username: `vod_status_test_${crypto.randomUUID()}`, passwordHash: "test", role: "ADMIN" } });
      users.push(user);
      const row = await prisma.vodRequest.create({ data: { userId: user.id, tmdbId, mediaType: "TV", season: 1, title: "test", titleOriginal: "test", bizStatus, status: bizStatus === "COMPLETED" ? "APPROVED" : bizStatus === "NO_RESOURCE" ? "REJECTED" : "PENDING", createdAt: new Date(now.getTime() - 10000 + index * 1000) } });
      rows.push(row);
      await prisma.vodPointEntry.create({ data: { requestId: row.id, userId: user.id, cost: 10, month, state: bizStatus === "COMPLETED" ? "CHARGED" : bizStatus === "NO_RESOURCE" ? "RELEASED" : "RESERVED" } });
    }
    const otherSeason = await prisma.vodRequest.create({ data: { userId: users[0].id, tmdbId, mediaType: "TV", season: 2, title: "test", titleOriginal: "test" } });
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { userId: users[0].id, username: users[0].username, role: "ADMIN", panelLoginAt: Date.now() }, maxAge: 60 });
    const baseUrl = process.env.VOD_API_TEST_URL || "http://localhost:3000";
    const patch = async (id, bizStatus) => {
      const response = await fetch(`${baseUrl}/api/admin/vod-requests/${id}`, { method: "PATCH", headers: { cookie: `next-auth.session-token=${token}`, "content-type": "application/json" }, body: JSON.stringify({ bizStatus }) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
    };
    const state = async (id) => (await prisma.vodRequest.findUnique({ where: { id } })).bizStatus;
    const points = async (id) => (await prisma.vodPointEntry.findUnique({ where: { requestId: id } })).state;
    await patch(rows[3].id, "NO_RESOURCE");
    assert.equal(await state(rows[0].id), "COMPLETED");
    assert.equal(await points(rows[0].id), "CHARGED");
    for (const row of rows.slice(1)) assert.equal(await state(row.id), "NO_RESOURCE");
    assert.equal(await state(otherSeason.id), "PENDING");
    await patch(rows[3].id, "COMPLETED");
    for (const row of rows) {
      assert.equal(await state(row.id), "COMPLETED");
      assert.equal(await points(row.id), "CHARGED");
    }
    await patch(rows[3].id, "PROCESSING");
    for (const row of rows.slice(0, 3)) {
      assert.equal(await state(row.id), "COMPLETED");
      assert.equal(await points(row.id), "CHARGED");
    }
    assert.equal(await state(rows[3].id), "PROCESSING");
    assert.equal(await points(rows[3].id), "RELEASED");
    // Explicit correction of a completed request remains supported and refunds only that requester.
    await patch(rows[0].id, "NO_RESOURCE");
    assert.equal(await state(rows[0].id), "NO_RESOURCE");
    assert.equal(await points(rows[0].id), "RELEASED");
    assert.equal(await state(rows[1].id), "COMPLETED");
    assert.equal(await points(rows[1].id), "CHARGED");
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.$disconnect();
  }
});
