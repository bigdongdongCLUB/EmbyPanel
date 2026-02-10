export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { encryptSyncPassword } from "@/lib/user-secrets";

const PatchSchema = z.object({
  email: z.string().email().nullable().optional(),
  expiryReminderEnabled: z.boolean().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
});

async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "unauthorized", status: 401 as const };
  const username = (session as any)?.username;
  if (!username) return { error: "unauthorized", status: 401 as const };

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      email: true,
      expiryReminderEnabled: true,
      passwordHash: true,
    },
  });

  if (!user) return { error: "not_found", status: 404 as const };
  return { user };
}

export async function GET() {
  const me = await getCurrentUser();
  if ("error" in me) return NextResponse.json({ error: me.error }, { status: me.status });

  return NextResponse.json({
    ok: true,
    profile: {
      username: me.user.username,
      email: me.user.email,
      expiryReminderEnabled: me.user.expiryReminderEnabled,
    },
  });
}

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if ("error" in me) return NextResponse.json({ error: me.error }, { status: me.status });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const p = parsed.data;
  const data: any = {};

  if (p.email !== undefined) data.email = p.email;
  if (p.expiryReminderEnabled !== undefined) data.expiryReminderEnabled = p.expiryReminderEnabled;

  const wantChangePassword = !!(p.currentPassword || p.newPassword || p.confirmPassword);
  if (wantChangePassword) {
    if (!p.currentPassword || !p.newPassword || !p.confirmPassword) {
      return NextResponse.json({ error: "password_fields_required" }, { status: 400 });
    }
    if (p.newPassword.length < 6) return NextResponse.json({ error: "password_too_short" }, { status: 400 });
    if (p.newPassword !== p.confirmPassword) return NextResponse.json({ error: "password_confirm_mismatch" }, { status: 400 });

    const ok = await verifyPassword(p.currentPassword, me.user.passwordHash);
    if (!ok) return NextResponse.json({ error: "current_password_invalid" }, { status: 400 });

    data.passwordHash = await hashPassword(p.newPassword);
    const enc = encryptSyncPassword(p.newPassword);
    data.syncPasswordEnc = enc.enc;
    data.syncPasswordIv = enc.iv;
    data.syncPasswordTag = enc.tag;
  }

  await prisma.user.update({ where: { id: me.user.id }, data });
  return NextResponse.json({ ok: true });
}
