export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import nodemailer from "nodemailer";

import { prisma } from "@/lib/db";
import { decryptString } from "@/lib/crypto";

const BodySchema = z.object({ email: z.string().email(), username: z.string().max(100).optional() });
const MAIL_KEY = "mail_basic";
const TEMPLATE_KEY = "mail_templates";
const SITE_KEY = "site_basic";
const DEFAULT_SUBJECT = "欢迎注册 {{siteName}} - 请验证您的邮箱";
const DEFAULT_BODY = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333;">欢迎注册 {{siteName}}</h2>
  <p>尊敬的 {{username}}，</p>
  <p>感谢您注册 {{siteName}}！为了确保您的账户安全，请使用以下验证码完成邮箱验证：</p>

  <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
    <span style="font-size: 24px; font-weight: bold; color: #007bff;">{{verificationCode}}</span>
  </div>

  <p>此验证码将在 10 分钟后过期，请尽快完成验证。</p>
  <p>如果您没有注册此账户，请忽略此邮件。</p>
</div>`;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
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

function normalizeSiteUrl(req: Request) {
  const envUrl = String(process.env.NEXTAUTH_URL || "").trim();
  if (envUrl && /^https?:\/\//i.test(envUrl) && !envUrl.includes("${")) return envUrl.replace(/\/+$/, "");
  return new URL(req.url).origin.replace(/\/+$/, "");
}

function code6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const p = BodySchema.safeParse(body);
  if (!p.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const [securityRow, mailRow, templateRow, siteRow] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "security_basic" } }),
    prisma.appSetting.findUnique({ where: { key: MAIL_KEY } }),
    prisma.appSetting.findUnique({ where: { key: TEMPLATE_KEY } }),
    prisma.appSetting.findUnique({ where: { key: SITE_KEY } }),
  ]);
  const security = isRecord(securityRow?.valueJson) ? securityRow.valueJson : {};
  if (!security?.requireEmailVerification) return NextResponse.json({ ok: true, skipped: true });

  const mail = isRecord(mailRow?.valueJson) ? mailRow.valueJson : {};
  if (!mail?.enabled || !mail?.smtpHost || !mail?.fromEmail) return NextResponse.json({ error: "mail_not_configured" }, { status: 400 });

  const password = decodePassword(mail);
  const transporter = nodemailer.createTransport({
    host: String(mail.smtpHost),
    port: Number(mail.smtpPort || 465),
    secure: String(mail.secureMode || "ssl") === "ssl",
    requireTLS: String(mail.secureMode || "ssl") === "starttls",
    auth: mail.smtpUser ? { user: String(mail.smtpUser), pass: password } : undefined,
  });

  const templates = isRecord(templateRow?.valueJson) ? templateRow.valueJson : {};
  const registerTemplate = isRecord(templates.register_verify) ? templates.register_verify : {};
  const subjectTpl = String(registerTemplate.subject || DEFAULT_SUBJECT);
  const bodyTpl = String(registerTemplate.bodyHtml || DEFAULT_BODY);
  const site = isRecord(siteRow?.valueJson) ? siteRow.valueJson : {};
  const siteName = String(site.siteName || "EmbyPanel");
  const siteUrl = normalizeSiteUrl(req);
  const code = code6();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const email = p.data.email.trim().toLowerCase();
  const username = p.data.username?.trim() || email.split("@")[0] || email;

  const codeKey = "register_email_codes";
  const row = await prisma.appSetting.findUnique({ where: { key: codeKey } });
  const map = (isRecord(row?.valueJson) ? row.valueJson : {}) as Record<string, { code: string; expiresAt: number }>;
  map[email] = { code, expiresAt };

  await prisma.appSetting.upsert({
    where: { key: codeKey },
    create: { key: codeKey, valueJson: map },
    update: { valueJson: map },
  });

  await transporter.sendMail({
    from: mail.fromName ? `${String(mail.fromName)} <${String(mail.fromEmail)}>` : String(mail.fromEmail),
    to: p.data.email,
    subject: applyVars(subjectTpl, {
      siteName,
      siteUrl,
      username,
      email,
      verificationCode: code,
      currentYear: String(new Date().getFullYear()),
    }),
    html: applyVars(bodyTpl, {
      siteName,
      siteUrl,
      username,
      email,
      verificationCode: code,
      currentYear: String(new Date().getFullYear()),
    }),
  });

  return NextResponse.json({ ok: true });
}
