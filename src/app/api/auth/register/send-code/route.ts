export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import nodemailer from "nodemailer";

import { prisma } from "@/lib/db";
import { decryptString } from "@/lib/crypto";

const BodySchema = z.object({ email: z.string().email() });

function decodePassword(value: any): string {
  try {
    if (value?.smtpPasswordEnc && value?.smtpPasswordIv && value?.smtpPasswordTag) {
      return decryptString({ enc: value.smtpPasswordEnc, iv: value.smtpPasswordIv, tag: value.smtpPasswordTag });
    }
  } catch {}
  return "";
}

function code6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const p = BodySchema.safeParse(body);
  if (!p.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const securityRow = await prisma.appSetting.findUnique({ where: { key: "security_basic" } });
  const security = (securityRow?.valueJson as any) ?? {};
  if (!security?.requireEmailVerification) return NextResponse.json({ ok: true, skipped: true });

  const mailRow = await prisma.appSetting.findUnique({ where: { key: "mail_basic" } });
  const mail = (mailRow?.valueJson as any) ?? {};
  if (!mail?.enabled || !mail?.smtpHost || !mail?.fromEmail) return NextResponse.json({ error: "mail_not_configured" }, { status: 400 });

  const password = decodePassword(mail);
  const transporter = nodemailer.createTransport({
    host: String(mail.smtpHost),
    port: Number(mail.smtpPort || 465),
    secure: String(mail.secureMode || "ssl") === "ssl",
    requireTLS: String(mail.secureMode || "ssl") === "starttls",
    auth: mail.smtpUser ? { user: String(mail.smtpUser), pass: password } : undefined,
  });

  const code = code6();
  const expiresAt = Date.now() + 10 * 60 * 1000;

  const codeKey = "register_email_codes";
  const row = await prisma.appSetting.findUnique({ where: { key: codeKey } });
  const map = ((row?.valueJson as any) ?? {}) as Record<string, { code: string; expiresAt: number }>;
  map[p.data.email.toLowerCase()] = { code, expiresAt };

  await prisma.appSetting.upsert({
    where: { key: codeKey },
    create: { key: codeKey, valueJson: map },
    update: { valueJson: map },
  });

  await transporter.sendMail({
    from: mail.fromName ? `${mail.fromName} <${mail.fromEmail}>` : mail.fromEmail,
    to: p.data.email,
    subject: "注册邮箱验证码",
    text: `您的注册验证码是：${code}，10分钟内有效。`,
  });

  return NextResponse.json({ ok: true });
}
