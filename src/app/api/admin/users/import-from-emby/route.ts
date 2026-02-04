export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchUsers } from "@/lib/emby";
import { hashPassword } from "@/lib/password";
import { encryptSyncPassword } from "@/lib/user-secrets";

function randomPassword(len = 16) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

const Schema = z.object({
  embyServerId: z.string().min(1),
  missingOnly: z.boolean().optional().default(true),
  skipAdmins: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const { embyServerId, missingOnly, skipAdmins } = parsed.data;

  const server = await prisma.embyServer.findUnique({
    where: { id: embyServerId },
    select: { id: true, name: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
  });
  if (!server) return NextResponse.json({ error: "server_not_found" }, { status: 404 });

  const apiKey = getEmbyApiKeyForServer(server);
  if (!apiKey) return NextResponse.json({ error: "missing_emby_api_key" }, { status: 400 });

  const usersRes = await embyFetchUsers(server.baseUrl, apiKey);
  if (!usersRes.ok) return NextResponse.json({ error: "emby_fetch_users_failed", status: usersRes.status, body: usersRes.body }, { status: 502 });

  const embyUsers = usersRes.users;

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
      const user = await prisma.user.findUnique({ where: { username: name }, select: { id: true } });
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
      continue;
    }

    // create panel user
    const plainPw = randomPassword(16);
    const passwordHash = await hashPassword(plainPw);
    const enc = encryptSyncPassword(plainPw);

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

    imported++;
    details.push({ name, embyUserId, action: "created" });
  }

  return NextResponse.json({ ok: true, server: { id: server.id, name: server.name }, imported, skipped, details });
}
