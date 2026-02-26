export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { encryptSyncPassword } from "@/lib/user-secrets";

const CODE_MAP_KEY = "invite_code_map";
const REL_KEY = "invite_relations";

const schema = z.object({
  username: z
    .string()
    .min(5, "用户名至少5个字符")
    .max(24, "用户名不超过24个字符")
    .regex(/^[a-zA-Z0-9]+$/, "用户名只能包含字母或字母与数字的组合")
    .refine((v) => !/^[0-9]+$/.test(v), "用户名不能全为数字"),
  email: z.string().email().optional(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  inviteCode: z.string().min(3).max(32).optional(),
  emailCode: z.string().min(4).max(8).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const username = parsed.data.username.trim();
  const email = parsed.data.email?.toLowerCase().trim();

  const securityRow = await prisma.appSetting.findUnique({ where: { key: "security_basic" } });
  const security = (securityRow?.valueJson as any) ?? {};

  if (security.openRegistration === false) {
    return NextResponse.json({ error: "registration_closed" }, { status: 403 });
  }

  if (security.inviteOnly && !parsed.data.inviteCode?.trim()) {
    return NextResponse.json({ error: "invite_required" }, { status: 400 });
  }

  const reserved = String(security.reservedUsernames || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const reservedBuiltIn = new Set(["atemplate", ...reserved]);
  if (reservedBuiltIn.has(username.toLowerCase())) {
    return NextResponse.json({ error: "reserved_username" }, { status: 400 });
  }

  if (security.strongPassword) {
    const pw = parsed.data.password || "";
    const ok =
      pw.length >= 10 &&
      pw.length <= 32 &&
      /[a-z]/.test(pw) &&
      /[A-Z]/.test(pw) &&
      /[0-9]/.test(pw) &&
      /[^A-Za-z0-9]/.test(pw);
    if (!ok) return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  if (security.requireEmailVerification) {
    if (!email) return NextResponse.json({ error: "email_required_for_verification" }, { status: 400 });
    const code = (parsed.data.emailCode || "").trim();
    if (!code) return NextResponse.json({ error: "email_code_required" }, { status: 400 });

    const codeRow = await prisma.appSetting.findUnique({ where: { key: "register_email_codes" } });
    const map = ((codeRow?.valueJson as any) ?? {}) as Record<string, { code: string; expiresAt: number }>;
    const item = map[email];
    if (!item || item.code !== code || Number(item.expiresAt || 0) < Date.now()) {
      return NextResponse.json({ error: "email_code_invalid" }, { status: 400 });
    }

    delete map[email];
    await prisma.appSetting.upsert({
      where: { key: "register_email_codes" },
      create: { key: "register_email_codes", valueJson: map },
      update: { valueJson: map },
    });
  }

  const existingUsername = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } }, select: { id: true } });
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
