export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { encryptSyncPassword } from "@/lib/user-secrets";

const CODE_MAP_KEY = "invite_code_map";
const REL_KEY = "invite_relations";

const schema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email().optional(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  inviteCode: z.string().min(3).max(32).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const username = parsed.data.username.trim();
  const email = parsed.data.email?.toLowerCase().trim();

  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) {
    return NextResponse.json({ error: "username_taken" }, { status: 409 });
  }

  if (email) {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const enc = encryptSyncPassword(parsed.data.password);
  const inviteCodeRaw = (parsed.data.inviteCode || "").trim();
  const inviteCode = inviteCodeRaw.toUpperCase();

  const userCount = await prisma.user.count();
  const role = userCount === 0 ? "ADMIN" : "USER";

  const user = await prisma.user.create({
    data: {
      username,
      email,
      name: parsed.data.name,
      passwordHash,
      syncPasswordEnc: enc.enc,
      syncPasswordIv: enc.iv,
      syncPasswordTag: enc.tag,
      role,
    },
    select: { id: true, username: true, email: true, name: true, role: true },
  });

  // 邀请关系记录（轻量存于 AppSetting）
  if (inviteCode) {
    const [codeRow, relRow] = await Promise.all([
      prisma.appSetting.findUnique({ where: { key: CODE_MAP_KEY } }),
      prisma.appSetting.findUnique({ where: { key: REL_KEY } }),
    ]);

    const codeMap = ((codeRow?.valueJson as any) ?? {}) as Record<string, string>;
    const relMap = ((relRow?.valueJson as any) ?? {}) as Record<string, any>;

    let inviterUserId: string | null = null;
    for (const [uid, code] of Object.entries(codeMap)) {
      if (String(code).toUpperCase() === inviteCode) {
        inviterUserId = uid;
        break;
      }
    }

    if (!inviterUserId) {
      const inviter = await prisma.user.findUnique({ where: { username: inviteCodeRaw }, select: { id: true } });
      inviterUserId = inviter?.id ?? null;
    }

    if (inviterUserId && inviterUserId !== user.id) {
      relMap[user.id] = { inviterUserId, inviteCode: inviteCodeRaw || inviteCode, createdAt: new Date().toISOString() };
      await prisma.appSetting.upsert({
        where: { key: REL_KEY },
        create: { key: REL_KEY, valueJson: relMap },
        update: { valueJson: relMap },
      });
    }
  }

  return NextResponse.json({ user });
}
