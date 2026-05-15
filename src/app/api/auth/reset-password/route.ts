export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { encryptSyncPassword } from "@/lib/user-secrets";

const RESET_TOKEN_KEY = "password_reset_tokens";

const POST_SCHEMA = z.object({
  token: z.string().min(16).max(256),
  password: z.string().min(8).max(64),
  confirmPassword: z.string().min(1).max(64).optional(),
});

type ResetTokenMap = Record<string, { userId: string; email: string; expiresAt: number; createdAt: number }>;

function validatePasswordRules(password: string, strongPassword: boolean) {
  if (strongPassword) {
    const ok =
      password.length >= 10 &&
      password.length <= 32 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password);
    return ok;
  }

  return password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

async function loadTokenMap() {
  const row = await prisma.appSetting.findUnique({ where: { key: RESET_TOKEN_KEY } });
  const map = ((row?.valueJson as any) ?? {}) as ResetTokenMap;
  return map;
}

async function saveTokenMap(map: ResetTokenMap) {
  await prisma.appSetting.upsert({
    where: { key: RESET_TOKEN_KEY },
    create: { key: RESET_TOKEN_KEY, valueJson: map },
    update: { valueJson: map },
  });
}

function cleanupExpiredTokenMap(map: ResetTokenMap, nowMs: number) {
  for (const [k, v] of Object.entries(map)) {
    const exp = Number(v?.expiresAt || 0);
    if (!Number.isFinite(exp) || exp < nowMs) delete map[k];
  }
}

export async function GET(req: Request) {
  const token = String(new URL(req.url).searchParams.get("token") || "").trim();
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  const nowMs = Date.now();
  const map = await loadTokenMap();
  cleanupExpiredTokenMap(map, nowMs);

  const item = map[token];
  if (!item || Number(item.expiresAt || 0) < nowMs) {
    await saveTokenMap(map);
    return NextResponse.json({ error: "token_invalid_or_expired" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: String(item.userId) }, select: { username: true, email: true } });
  if (!user || !user.email || user.email.toLowerCase() !== String(item.email || "").toLowerCase()) {
    delete map[token];
    await saveTokenMap(map);
    return NextResponse.json({ error: "token_invalid_or_expired" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    username: user.username,
    email: user.email,
    expiresAt: item.expiresAt,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = POST_SCHEMA.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const token = parsed.data.token.trim();
  const password = parsed.data.password;

  if (parsed.data.confirmPassword && parsed.data.confirmPassword !== password) {
    return NextResponse.json({ error: "confirm_password_mismatch" }, { status: 400 });
  }

  const [securityRow, rawMap] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "security_basic" } }),
    loadTokenMap(),
  ]);

  const strongPassword = !!((securityRow?.valueJson as any)?.strongPassword);
  if (!validatePasswordRules(password, strongPassword)) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  const nowMs = Date.now();
  const map = rawMap;
  cleanupExpiredTokenMap(map, nowMs);

  const item = map[token];
  if (!item || Number(item.expiresAt || 0) < nowMs) {
    await saveTokenMap(map);
    return NextResponse.json({ error: "token_invalid_or_expired" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: String(item.userId) }, select: { id: true, email: true } });
  if (!user || !user.email || user.email.toLowerCase() !== String(item.email || "").toLowerCase()) {
    delete map[token];
    await saveTokenMap(map);
    return NextResponse.json({ error: "token_invalid_or_expired" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const enc = encryptSyncPassword(password);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      syncPasswordEnc: enc.enc,
      syncPasswordIv: enc.iv,
      syncPasswordTag: enc.tag,
      sessionInvalidatedAt: new Date(),
    },
  });

  // 重置成功后，撤销该用户的所有重置 token
  for (const [k, v] of Object.entries(map)) {
    if (String(v?.userId || "") === user.id) delete map[k];
  }

  await saveTokenMap(map);

  return NextResponse.json({ ok: true });
}
