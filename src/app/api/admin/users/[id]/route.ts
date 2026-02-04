export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { hashPassword } from "@/lib/password";
import { encryptSyncPassword, getSyncPassword } from "@/lib/user-secrets";
import { embyCreateUser, embySetUserPassword } from "@/lib/emby-provision";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchUsers } from "@/lib/emby";

const PatchSchema = z.object({
  email: z.string().email().nullable().optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  enabled: z.boolean().optional(),
  expiryReminderEnabled: z.boolean().optional(),
  balanceCents: z.number().int().min(0).optional(),

  changePassword: z.boolean().optional(),
  newPassword: z.string().min(6).max(200).optional(),

  subscription: z
    .object({
      planId: z.string().min(1),
      payCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).nullable().optional(),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
      embyServerIds: z.array(z.string().min(1)).default([]),
    })
    .nullable()
    .optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      enabled: true,
      balanceCents: true,
      expiryReminderEnabled: true,
      createdAt: true,
      embyLinks: { select: { embyServerId: true, embyUserId: true, embyServer: { select: { name: true } } } },
      subscriptions: {
        where: { status: "ACTIVE" },
        orderBy: { endAt: "desc" },
        take: 1,
        select: {
          id: true,
          planId: true,
          payCycle: true,
          startAt: true,
          endAt: true,
          plan: { select: { id: true, name: true } },
          servers: { select: { embyServerId: true, embyServer: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const plans = await prisma.plan.findMany({ where: { enabled: true }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, durationDays: true } });
  const servers = await prisma.embyServer.findMany({ where: { enabled: true }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } });

  return NextResponse.json({ ok: true, user, plans, servers });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const data: any = {};
  if (parsed.data.email !== undefined) data.email = parsed.data.email;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
  if (parsed.data.expiryReminderEnabled !== undefined) data.expiryReminderEnabled = parsed.data.expiryReminderEnabled;
  if (parsed.data.balanceCents !== undefined) data.balanceCents = parsed.data.balanceCents;

  let newPlainPassword: string | null = null;
  if (parsed.data.changePassword) {
    const pw = parsed.data.newPassword ?? "";
    if (pw.length < 6) return NextResponse.json({ error: "password_too_short" }, { status: 400 });
    data.passwordHash = await hashPassword(pw);
    const enc = encryptSyncPassword(pw);
    data.syncPasswordEnc = enc.enc;
    data.syncPasswordIv = enc.iv;
    data.syncPasswordTag = enc.tag;
    newPlainPassword = pw;
  }

  const subscription = parsed.data.subscription;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data });

    if (subscription !== undefined) {
      // Replace active subscription (simple MVP)
      await tx.subscription.updateMany({ where: { userId: id, status: "ACTIVE" }, data: { status: "CANCELED" } });

      if (subscription !== null) {
        const sub = await tx.subscription.create({
          data: {
            userId: id,
            planId: subscription.planId,
            status: "ACTIVE",
            payCycle: subscription.payCycle ?? null,
            startAt: new Date(subscription.startAt),
            endAt: new Date(subscription.endAt),
          },
        });

        if (subscription.embyServerIds?.length) {
          await tx.subscriptionServer.createMany({
            data: subscription.embyServerIds.map((sid) => ({ subscriptionId: sub.id, embyServerId: sid })),
            skipDuplicates: true,
          });
        }
      }
    }
  });

  // Provision/sync to Emby after commit (best-effort)
  if (subscription && subscription.embyServerIds?.length) {
    const [user, servers] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          username: true,
          syncPasswordEnc: true,
          syncPasswordIv: true,
          syncPasswordTag: true,
        },
      }),
      prisma.embyServer.findMany({
        where: { id: { in: subscription.embyServerIds } },
        select: {
          id: true,
          name: true,
          baseUrl: true,
          apiKey: true,
          apiKeyEnc: true,
          apiKeyIv: true,
          apiKeyTag: true,
        },
      }),
    ]);

    if (user) {
      const pw = newPlainPassword ?? getSyncPassword(user);
      if (!pw) {
        return NextResponse.json({ ok: true, warn: "missing_sync_password" });
      }

      for (const s of servers) {
        const apiKey = getEmbyApiKeyForServer(s);

        // find emby user by name
        const usersRes = await embyFetchUsers(s.baseUrl, apiKey);
        let embyUserId: string | null = null;
        if (usersRes.ok) {
          const found = usersRes.users.find((u: any) => String(u?.Name ?? "").toLowerCase() === user.username.toLowerCase());
          if (found?.Id) embyUserId = String(found.Id);
        }

        if (!embyUserId) {
          const created = await embyCreateUser(s.baseUrl, apiKey, user.username);
          if (created.ok) embyUserId = created.userId;
        }

        if (embyUserId) {
          await embySetUserPassword(s.baseUrl, apiKey, embyUserId, pw);
          await prisma.embyUserLink.upsert({
            where: { userId_embyServerId: { userId: user.id, embyServerId: s.id } },
            update: { embyUserId: embyUserId },
            create: { userId: user.id, embyServerId: s.id, embyUserId: embyUserId },
          });
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
