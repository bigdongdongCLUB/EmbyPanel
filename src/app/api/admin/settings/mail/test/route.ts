export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import nodemailer from "nodemailer";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { decryptString } from "@/lib/crypto";

const KEY = "mail_basic";

const Schema = z.object({
  to: z.string().email().optional(),
  enabled: z.boolean().optional(),
  smtpHost: z.string().min(1).max(200),
  secureMode: z.enum(["ssl", "starttls", "none"]).default("ssl"),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpUser: z.string().max(200).default(""),
  smtpPassword: z.string().max(500).optional(),
  fromEmail: z.string().email(),
  fromName: z.string().max(200).default(""),
});

function decodePassword(value: any): string {
  try {
    if (value?.smtpPasswordEnc && value?.smtpPasswordIv && value?.smtpPasswordTag) {
      return decryptString({ enc: value.smtpPasswordEnc, iv: value.smtpPasswordIv, tag: value.smtpPasswordTag });
    }
  } catch {}
  return "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const p = parsed.data;

  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const saved = (row?.valueJson as any) ?? {};
  const savedPassword = decodePassword(saved);
  const password = p.smtpPassword && p.smtpPassword.length ? p.smtpPassword : savedPassword;

  if (p.smtpUser && !password) {
    return NextResponse.json({ error: "smtp_password_required" }, { status: 400 });
  }

  const transporter = nodemailer.createTransport({
    host: p.smtpHost,
    port: p.smtpPort,
    secure: p.secureMode === "ssl",
    requireTLS: p.secureMode === "starttls",
    auth: p.smtpUser ? { user: p.smtpUser, pass: password } : undefined,
  });

  const to = p.to || p.fromEmail;

  await transporter.sendMail({
    from: p.fromName ? `${p.fromName} <${p.fromEmail}>` : p.fromEmail,
    to,
    subject: "[EmbyPanel] SMTP 测试邮件", 
    text: `这是一封来自 EmbyPanel 的测试邮件。\n\n发送时间: ${new Date().toISOString()}`,
  });

  return NextResponse.json({ ok: true });
}
