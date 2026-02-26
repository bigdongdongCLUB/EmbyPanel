export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchUsers } from "@/lib/emby";
import { hashPassword } from "@/lib/password";
import { encryptSyncPassword } from "@/lib/user-secrets";

const TEMPLATE_USERNAME = "atemplate";

const Schema = z.object({
  embyServerId: z.string().min(1),
  defaultPassword: z.string().min(6).max(200),

  // optional: assign plan on import
  planId: z.string().min(1).nullable().optional(),
  payCycle: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "TWO_YEARLY"]).nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),

  mode: z.enum(["ALL", "SELECTED"]).optional().default("ALL"),
  usernames: z.array(z.string().min(1)).nullable().optional(),

  missingOnly: z.boolean().optional().default(true),
  skipAdmins: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const { embyServerId, missingOnly, skipAdmins, defaultPassword, planId, payCycle, startAt, endAt, mode, usernames } = parsed.data;

  const server = await prisma.embyServer.findUnique({
    where: { id: embyServerId },
    select: { id: true, name: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
  });
  if (!server) return NextResponse.json({ error: "server_not_found" }, { status: 404 });

  const apiKey = getEmbyApiKeyForServer(server);
  if (!apiKey) return NextResponse.json({ error: "missing_emby_api_key" }, { status: 400 });

  const usersRes = await embyFetchUsers(server.baseUrl, apiKey);
  if (!usersRes.ok) return NextResponse.json({ error: "emby_fetch_users_failed", status: usersRes.status, body: usersRes.body }, { status: 502 });

  const embyUsersAll = usersRes.users as any[];
  const allowNameSet =
    mode === "SELECTED" && usernames?.length
      ? new Set(usernames.map((s) => s.trim().toLowerCase()).filter(Boolean))
      : null;

  const embyUsers = (allowNameSet ? embyUsersAll.filter((u) => allowNameSet.has(String(u?.Name ?? "").trim().toLowerCase())) : embyUsersAll).filter(
    (u) => String(u?.Name ?? "").trim().toLowerCase() !== TEMPLATE_USERNAME,
  );

  const existingUsernames = new Set(
    (
      await prisma.user.findMany({ select: { username: true } })
    ).map((u) => u.username.toLowerCase()),
  );

  const existingLinks = new Set(
    (
      await prisma.embyUserLink.findMany({ where: { embyServerId }, select: { embyUserId: true } })
    ).map((l) => l.embyUserId),
  );

  // When planId is provided, startAt/endAt must be provided too (UI enforces).
  const finalPayCycle = (payCycle ?? "YEARLY") as "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "TWO_YEARLY";
  if (planId) {
    if (!startAt || !endAt) return NextResponse.json({ error: "missing_subscription_dates" }, { status: 400 });
    if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
      return NextResponse.json({ error: "subscription_date_invalid" }, { status: 400 });
    }
  }

  let imported = 0;
  let skipped = 0;
  const details: Array<{ name: string; embyUserId: string; action: string; reason?: string }> = [];

  for (const u of embyUsers as any[]) {
    const name = String(u?.Name ?? "").trim();
    const embyUserId = String(u?.Id ?? "").trim();
    if (!name || !embyUserId) {
      skipped++;
      details.push({ name, embyUserId, action: "skip", reason: "missing_name_or_id" });
      continue;
    }

    const isAdmin = !!u?.Policy?.IsAdministrator;
    if (skipAdmins && isAdmin) {
      skipped++;
      details.push({ name, embyUserId, action: "skip", reason: "is_admin" });
      continue;
    }

    if (missingOnly && existingUsernames.has(name.toLowerCase())) {
      // ensure link exists
      const user = await prisma.user.findFirst({ where: { username: { equals: name, mode: "insensitive" } }, select: { id: true } });
      if (user && !existingLinks.has(embyUserId)) {
        await prisma.embyUserLink.upsert({
          where: { userId_embyServerId: { userId: user.id, embyServerId } },
          update: { embyUserId },
          create: { userId: user.id, embyServerId, embyUserId },
        });
        imported++;
        details.push({ name, embyUserId, action: "link_only" });
      } else {
        skipped++;
        details.push({ name, embyUserId, action: "skip", reason: "already_exists" });
      }

      // optional: assign plan to existing panel user
      if (user && planId) {
        const cycle = finalPayCycle;
        const start = new Date(startAt as string);
        const end = new Date(endAt as string);

        await prisma.subscription.updateMany({ where: { userId: user.id, status: "ACTIVE" }, data: { status: "CANCELED" } });
        const sub = await prisma.subscription.create({
          data: {
            userId: user.id,
            planId,
            status: "ACTIVE",
            payCycle: cycle as any,
            startAt: start,
            endAt: end,
          },
        });
        await prisma.subscriptionServer.createMany({ data: [{ subscriptionId: sub.id, embyServerId }], skipDuplicates: true });
      }

      continue;
    }

    // create panel user
    const passwordHash = await hashPassword(defaultPassword);
    const enc = encryptSyncPassword(defaultPassword);

    const enabled = !(u?.Policy?.IsDisabled);

    const created = await prisma.user.create({
      data: {
        username: name,
        email: null,
        passwordHash,
        syncPasswordEnc: enc.enc,
        syncPasswordIv: enc.iv,
        syncPasswordTag: enc.tag,
        role: "USER",
        enabled,
      },
      select: { id: true },
    });

    await prisma.embyUserLink.create({ data: { userId: created.id, embyServerId, embyUserId } });

    if (planId) {
      const cycle = finalPayCycle;
      const start = new Date(startAt as string);
      const end = new Date(endAt as string);

      await prisma.subscription.updateMany({ where: { userId: created.id, status: "ACTIVE" }, data: { status: "CANCELED" } });
      const sub = await prisma.subscription.create({
        data: {
          userId: created.id,
          planId,
          status: "ACTIVE",
          payCycle: cycle as any,
          startAt: start,
          endAt: end,
        },
      });

      // persist desired server mapping as the current emby server for now.
      await prisma.subscriptionServer.createMany({ data: [{ subscriptionId: sub.id, embyServerId }], skipDuplicates: true });
    }

    imported++;
    details.push({ name, embyUserId, action: planId ? "created_with_plan" : "created" });
  }

  return NextResponse.json({ ok: true, server: { id: server.id, name: server.name }, imported, skipped, details });
}
