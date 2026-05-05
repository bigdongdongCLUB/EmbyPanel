export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import nodemailer from "nodemailer";

import { prisma } from "@/lib/db";
import { decryptString } from "@/lib/crypto";
import { MAIL_TEMPLATES_KEY, resolveMailTemplate } from "@/lib/mail-templates";

const BODY_SCHEMA = z.object({
  email: z.string().email(),
});

const RESET_TOKEN_KEY = "password_reset_tokens";
const TEMPLATE_KEY = MAIL_TEMPLATES_KEY;
const MAIL_KEY = "mail_basic";
const SITE_KEY = "site_basic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function decodePassword(value: unknown): string {
  try {
    if (isRecord(value) && value.smtpPasswordEnc && value.smtpPasswordIv && value.smtpPasswordTag) {
      return decryptString({ enc: String(value.smtpPasswordEnc), iv: String(value.smtpPasswordIv), tag: String(value.smtpPasswordTag) });
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

  const mail = isRecord(mailRow?.valueJson) ? mailRow.valueJson : {};
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

  const tpl = resolveMailTemplate(templateRow?.valueJson, "reset_password");
  const subjectTpl = tpl.subject;
  const bodyTpl = tpl.bodyHtml;

  const site = isRecord(siteRow?.valueJson) ? siteRow.valueJson : {};
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
      from: mail.fromName ? `${String(mail.fromName)} <${String(mail.fromEmail)}>` : String(mail.fromEmail),
      to: user.email,
      subject: applyVars(subjectTpl, vars),
      html: applyVars(bodyTpl, vars),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: "send_mail_failed", message: getErrorMessage(e) }, { status: 500 });
  }

  const tokenMap = (isRecord(tokenRow?.valueJson) ? tokenRow.valueJson : {}) as Record<string, { userId: string; email: string; expiresAt: number; createdAt: number }>;

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
