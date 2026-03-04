export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import nodemailer from "nodemailer";

import { prisma } from "@/lib/db";
import { decryptString } from "@/lib/crypto";

const BODY_SCHEMA = z.object({
  email: z.string().email(),
});

const RESET_TOKEN_KEY = "password_reset_tokens";
const TEMPLATE_KEY = "mail_templates";
const MAIL_KEY = "mail_basic";
const SITE_KEY = "site_basic";

const DEFAULT_SUBJECT = "{{siteName}} - 重置密码请求";
const DEFAULT_BODY = `<p>尊敬的 {{username}}，</p><p>点击链接重置密码：<a href="{{resetUrl}}">{{resetUrl}}</a></p><p>链接将在1小时后过期。</p>`;

function decodePassword(value: any): string {
  try {
    if (value?.smtpPasswordEnc && value?.smtpPasswordIv && value?.smtpPasswordTag) {
      return decryptString({ enc: value.smtpPasswordEnc, iv: value.smtpPasswordIv, tag: value.smtpPasswordTag });
    }
  } catch {}
  return "";
}

function applyVars(text: string, vars: Record<string, string>) {
  let out = String(text || "");
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v);
  return out;
}

function makeResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizeSiteUrl(req: Request) {
  const envUrl = String(process.env.NEXTAUTH_URL || "").trim();
  if (envUrl && /^https?:\/\//i.test(envUrl) && !envUrl.includes("${")) return envUrl.replace(/\/+$/, "");
  return new URL(req.url).origin.replace(/\/+$/, "");
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BODY_SCHEMA.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, username: true, email: true },
  });

  if (!user || !user.email) {
    return NextResponse.json({ error: "email_not_registered" }, { status: 404 });
  }

  const [mailRow, templateRow, siteRow, tokenRow] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: MAIL_KEY } }),
    prisma.appSetting.findUnique({ where: { key: TEMPLATE_KEY } }),
    prisma.appSetting.findUnique({ where: { key: SITE_KEY } }),
    prisma.appSetting.findUnique({ where: { key: RESET_TOKEN_KEY } }),
  ]);

  const mail = (mailRow?.valueJson as any) ?? {};
  if (!mail?.enabled || !mail?.smtpHost || !mail?.fromEmail) {
    return NextResponse.json({ error: "mail_not_configured" }, { status: 400 });
  }

  const smtpPassword = decodePassword(mail);
  if (mail.smtpUser && !smtpPassword) {
    return NextResponse.json({ error: "mail_not_configured" }, { status: 400 });
  }

  const transporter = nodemailer.createTransport({
    host: String(mail.smtpHost),
    port: Number(mail.smtpPort || 465),
    secure: String(mail.secureMode || "ssl") === "ssl",
    requireTLS: String(mail.secureMode || "ssl") === "starttls",
    auth: mail.smtpUser ? { user: String(mail.smtpUser), pass: smtpPassword } : undefined,
  });

  const tpl = ((templateRow?.valueJson as any)?.reset_password ?? {}) as { subject?: string; bodyHtml?: string };
  const subjectTpl = String(tpl.subject || DEFAULT_SUBJECT);
  const bodyTpl = String(tpl.bodyHtml || DEFAULT_BODY);

  const site = (siteRow?.valueJson as any) ?? {};
  const siteName = String(site.siteName || "BestEmby");
  const siteUrl = normalizeSiteUrl(req);

  const now = Date.now();
  const expiresAt = now + 60 * 60 * 1000;
  const token = makeResetToken();
  const resetUrl = `${siteUrl}/reset-password?token=${encodeURIComponent(token)}`;

  const vars = {
    siteName,
    siteUrl,
    username: user.username,
    email: user.email,
    resetUrl,
    expireAt: new Date(expiresAt).toISOString(),
    currentYear: String(new Date().getFullYear()),
  };

  try {
    await transporter.sendMail({
      from: mail.fromName ? `${mail.fromName} <${mail.fromEmail}>` : mail.fromEmail,
      to: user.email,
      subject: applyVars(subjectTpl, vars),
      html: applyVars(bodyTpl, vars),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "send_mail_failed", message: String(e?.message ?? e) }, { status: 500 });
  }

  const tokenMap = ((tokenRow?.valueJson as any) ?? {}) as Record<string, { userId: string; email: string; expiresAt: number; createdAt: number }>;

  // 清理过期 token，避免无限增长
  for (const [k, v] of Object.entries(tokenMap)) {
    const exp = Number(v?.expiresAt || 0);
    if (!Number.isFinite(exp) || exp < now) delete tokenMap[k];
  }

  tokenMap[token] = {
    userId: user.id,
    email: user.email,
    expiresAt,
    createdAt: now,
  };

  await prisma.appSetting.upsert({
    where: { key: RESET_TOKEN_KEY },
    create: { key: RESET_TOKEN_KEY, valueJson: tokenMap },
    update: { valueJson: tokenMap },
  });

  return NextResponse.json({ ok: true });
}
