export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const KEY = "mail_templates";

const TemplateSchema = z.object({
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1).max(100_000),
});

const SaveSchema = z.object({
  key: z.string().min(1),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1).max(100_000),
});

const DEFAULT_TEMPLATES: Record<string, { label: string; subject: string; bodyHtml: string }> = {
  register_verify: {
    label: "注册验证邮件",
    subject: "欢迎注册 {{siteName}} - 请验证您的邮箱",
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333;">欢迎注册 {{siteName}}</h2>
  <p>尊敬的 {{username}}，</p>
  <p>感谢您注册 {{siteName}}！为了确保您的账户安全，请使用以下验证码完成邮箱验证：</p>

  <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
    <span style="font-size: 24px; font-weight: bold; color: #007bff;">{{verificationCode}}</span>
  </div>

  <p>此验证码将在 10 分钟后过期，请尽快完成验证。</p>
  <p>如果您没有注册此账户，请忽略此邮件。</p>
</div>`,
  },
  reset_password: {
    label: "忘记密码邮件",
    subject: "{{siteName}} 密码重置通知",
    bodyHtml: "<p>您好 {{username}}，点击链接重置密码：{{resetUrl}}</p>",
  },
  change_email: {
    label: "邮箱变更验证邮件",
    subject: "{{siteName}} 邮箱变更验证",
    bodyHtml: "<p>您好 {{username}}，您的邮箱变更验证码：{{verificationCode}}</p>",
  },
  sub_expiring: {
    label: "订阅即将到期警告",
    subject: "{{siteName}} 订阅即将到期提醒",
    bodyHtml: "<p>您好 {{username}}，您的订阅将于 {{expireAt}} 到期。</p>",
  },
  sub_expired: {
    label: "订阅已过期通知",
    subject: "{{siteName}} 订阅已过期",
    bodyHtml: "<p>您好 {{username}}，您的订阅已过期，请及时续费。</p>",
  },
  order_confirm: {
    label: "订单确认邮件",
    subject: "{{siteName}} 订单确认",
    bodyHtml: "<p>订单 {{orderNo}} 已确认，金额 {{amount}}。</p>",
  },
  worker_reply: {
    label: "工单回复通知",
    subject: "{{siteName}} 工单回复",
    bodyHtml: "<p>工单 {{ticketNo}} 有新回复。</p>",
  },
  invite_user: {
    label: "用户邀请邮件",
    subject: "邀请加入 {{siteName}}",
    bodyHtml: "<p>您好，{{inviterName}} 邀请您加入 {{siteName}}：{{inviteUrl}}</p>",
  },
};

function mergeTemplates(value: any) {
  const out: Record<string, { label: string; subject: string; bodyHtml: string }> = {};
  for (const [k, d] of Object.entries(DEFAULT_TEMPLATES)) {
    const t = value?.[k] ?? {};
    const parsed = TemplateSchema.safeParse({
      subject: t.subject ?? d.subject,
      bodyHtml: t.bodyHtml ?? d.bodyHtml,
    });
    out[k] = {
      label: d.label,
      subject: parsed.success ? parsed.data.subject : d.subject,
      bodyHtml: parsed.success ? parsed.data.bodyHtml : d.bodyHtml,
    };
  }
  return out;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const templates = mergeTemplates((row?.valueJson as any) ?? {});

  return NextResponse.json({ ok: true, data: { templates } });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = SaveSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const { key, subject, bodyHtml } = parsed.data;
  if (!DEFAULT_TEMPLATES[key]) return NextResponse.json({ error: "invalid_template_key" }, { status: 400 });

  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const current = ((row?.valueJson as any) ?? {}) as Record<string, any>;
  current[key] = { subject, bodyHtml };

  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, valueJson: current },
    update: { valueJson: current },
  });

  return NextResponse.json({ ok: true });
}
