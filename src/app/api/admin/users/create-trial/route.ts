export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { encryptSyncPassword } from "@/lib/user-secrets";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyCreateUser, embyDeleteUser, embySetUserDisabled, embySetUserPassword } from "@/lib/emby-provision";
import { embyFetchUsers } from "@/lib/emby";

const Schema = z.object({
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  planId: z.string().min(1),
  hours: z.number().int().min(1).max(168).optional().nullable(),
});

function randomAlphaNum(len: number) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function randomDigits(len: number) {
  let out = "";
  for (let i = 0; i < len; i++) out += String(Math.floor(Math.random() * 10));
  return out;
}

function validRegisterUsername(v: string) {
  const s = v.trim();
  if (s.length < 4 || s.length > 24) return false;
  if (!/^[a-zA-Z0-9]+$/.test(s)) return false;
  if (/^[0-9]+$/.test(s)) return false;
  if (s.toLowerCase() === "atemplate") return false;
  return true;
}

function parseAddressAndPort(baseUrl: string) {
  try {
    const u = new URL(baseUrl);
    const protocol = u.protocol || "https:";
    const host = u.hostname;
    const port = u.port || (protocol === "https:" ? "443" : "80");
    return { address: `${protocol}//${host}`, port };
  } catch {
    return { address: baseUrl, port: "" };
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const hours = parsed.data.hours ?? 1;
  const planId = parsed.data.planId;

  const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { id: true, name: true } });
  if (!plan) return NextResponse.json({ error: "plan_not_found" }, { status: 404 });

  let username = (parsed.data.username ?? "").trim();
  if (username) {
    if (!validRegisterUsername(username)) return NextResponse.json({ error: "invalid_username" }, { status: 400 });
    const exists = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } }, select: { id: true } });
    if (exists) return NextResponse.json({ error: "username_taken" }, { status: 409 });
  } else {
    for (let i = 0; i < 20; i++) {
      const candidate = randomAlphaNum(5);
      if (!validRegisterUsername(candidate)) continue;
      const exists = await prisma.user.findFirst({ where: { username: { equals: candidate, mode: "insensitive" } }, select: { id: true } });
      if (!exists) {
        username = candidate;
        break;
      }
    }
    if (!username) return NextResponse.json({ error: "username_generate_failed" }, { status: 500 });
  }

  const password = (parsed.data.password ?? "").trim() || randomDigits(8);
  if (password.length < 6) return NextResponse.json({ error: "password_too_short" }, { status: 400 });

  const passwordHash = await hashPassword(password);
  const enc = encryptSyncPassword(password);

  let userIdForRollback: string | null = null;
  const createdEmby: Array<{ baseUrl: string; apiKey: string; embyUserId: string }> = [];

  try {
    const user = await prisma.user.create({
      data: {
        username,
        email: null,
        passwordHash,
        syncPasswordEnc: enc.enc,
        syncPasswordIv: enc.iv,
        syncPasswordTag: enc.tag,
        role: "USER",
        enabled: true,
        expiryReminderEnabled: true,
      },
      select: { id: true, username: true },
    });
    userIdForRollback = user.id;

    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + hours * 3600 * 1000);

    const sub = await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: "ACTIVE",
        payCycle: "TRIAL",
        startAt,
        endAt,
      },
      select: { id: true },
    });

    const configs = await prisma.planServerConfig.findMany({ where: { planId: plan.id }, select: { embyServerId: true } });
    const serverIds = Array.from(new Set(configs.map((x) => x.embyServerId)));

    if (serverIds.length) {
      await prisma.subscriptionServer.createMany({
        data: serverIds.map((sid) => ({ subscriptionId: sub.id, embyServerId: sid })),
        skipDuplicates: true,
      });

      const servers = await prisma.embyServer.findMany({
        where: { id: { in: serverIds }, enabled: true },
        select: { id: true, baseUrl: true, externalUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
      });

      for (const s of servers) {
        const apiKey = getEmbyApiKeyForServer(s);
        let embyUserId: string | null = null;
        let justCreated = false;

        const usersRes = await embyFetchUsers(s.baseUrl, apiKey);
        if (!usersRes.ok) throw new Error("server_unreachable_generate_failed");
        const found = usersRes.users.find((u: any) => String(u?.Name ?? "").toLowerCase() === username.toLowerCase());
        if (found?.Id) embyUserId = String(found.Id);

        if (!embyUserId) {
          const created = await embyCreateUser(s.baseUrl, apiKey, username);
          if (!created.ok || !created.userId) throw new Error("server_unreachable_generate_failed");
          embyUserId = created.userId;
          justCreated = true;
        }

        const pwSet = await embySetUserPassword(s.baseUrl, apiKey, embyUserId, password);
        if (!pwSet.ok) throw new Error("server_unreachable_generate_failed");
        const enSet = await embySetUserDisabled(s.baseUrl, apiKey, embyUserId, false);
        if (!enSet.ok) throw new Error("server_unreachable_generate_failed");

        await prisma.embyUserLink.upsert({
          where: { userId_embyServerId: { userId: user.id, embyServerId: s.id } },
          update: { embyUserId, disabled: false },
          create: { userId: user.id, embyServerId: s.id, embyUserId, disabled: false },
        });

        if (justCreated) createdEmby.push({ baseUrl: s.baseUrl, apiKey, embyUserId });
      }
    }

    const firstServer = await prisma.embyServer.findFirst({ where: { id: { in: serverIds } }, select: { baseUrl: true, externalUrl: true } });
    const preferredUrl = firstServer?.externalUrl || firstServer?.baseUrl || "https://xx.bestemby.com";
    const addr = parseAddressAndPort(preferredUrl);

    return NextResponse.json({
      ok: true,
      result: {
        username,
        password,
        hours,
        address: addr.address,
        port: addr.port,
      },
    });
  } catch (e: any) {
    for (const c of createdEmby) {
      try {
        await embyDeleteUser(c.baseUrl, c.apiKey, c.embyUserId);
      } catch {}
    }
    if (userIdForRollback) {
      try {
        await prisma.user.delete({ where: { id: userIdForRollback } });
      } catch {}
    }
    if (String(e?.message ?? "") === "server_unreachable_generate_failed") {
      return NextResponse.json({ error: "server_unreachable_generate_failed" }, { status: 502 });
    }
    return NextResponse.json({ error: "trial_create_failed", detail: String(e?.message ?? e) }, { status: 500 });
  }
}
