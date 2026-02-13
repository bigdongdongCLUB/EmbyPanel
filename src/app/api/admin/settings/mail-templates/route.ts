export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const KEY = "mail_templates";
const NOTICE_KEY = "subscription_notice";

const TemplateSchema = z.object({
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1).max(100_000),
});

const SaveTemplateSchema = z.object({
  key: z.string().min(1),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1).max(100_000),
});

const SaveNoticeSchema = z.object({
  noticeDays: z.coerce.number().int().min(1).max(30),
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

// 2026-02-11: 当前线上已保存模板固化为默认预设（即使重置设置也可保留）
const PRESET_OVERRIDES: Record<string, { subject: string; bodyHtml: string }> = {
  invite_user: {
    subject: "{{siteName}} 邀请注册 - 链接{{expiresInHours}}小时内有效",
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #1890ff; margin-top: 0;">{{inviterName}} 邀请您加入 {{siteName}}</h2>
  <p>您好，{{username}}：</p>
  <p>{{inviterName}} 希望您加入 {{siteName}}，点击下方按钮即可完成注册并获取专属奖励：</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="{{inviteUrl}}" style="background-color: #1890ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
      接受邀请并注册
    </a>
  </div>

  <p>请在 <strong>{{expiresAt}}</strong> 前使用此链接，该邀请将在 <strong>{{expiresInHours}}</strong> 小时后过期。</p>
  <p>{{cardDescription}}</p>

  <p style="margin-top: 24px;">如果按钮无法打开，请复制以下链接到浏览器地址栏：</p>
  <div style="background: #f8f9fa; border-radius: 4px; padding: 12px; margin: 20px 0; word-break: break-all;">
    {{inviteUrl}}
  </div>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #666; font-size: 12px;">
    此邀请由 {{siteName}} 系统自动发送，请勿直接回复。<br>
    © {{currentYear}} {{siteName}}. 保留所有权利。
  </p>
</div>`,
  },
  sub_expired: {
    subject: "{{siteName}} - 您的订阅已过期",
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #dc3545;">订阅已过期</h2>
  <p>尊敬的 {{username}}，</p>
  <p>您在 {{siteName}} 的 <strong>{{subscriptionName}}</strong> 订阅已于 <strong>{{expiredDate}}</strong> 过期。</p>
  
  <p>您的账户已暂停使用，请续费以恢复服务：</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{renewUrl}}" style="background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
      立即续费恢复服务
    </a>
  </div>
  
  <p>如有任何问题，请联系我们的客服团队。</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #666; font-size: 12px;">
    此邮件由 {{siteName}} 系统自动发送，请勿回复。<br>
    © {{currentYear}} {{siteName}}. 保留所有权利。
  </p>
</div>`,
  },
  order_confirm: {
    subject: "{{siteName}} - 订单确认 #{{orderNumber}}",
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #28a745;">订单确认</h2>
  <p>尊敬的 {{username}}，</p>
  <p>感谢您的购买！您的订单已确认处理：</p>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0;">
    <h3 style="color: #333; margin-top: 0;">订单详情</h3>
    <p><strong>订单号：</strong>{{orderNumber}}</p>
    <p><strong>购买项目：</strong>{{subscriptionName}}</p>
    <p><strong>金额：</strong>¥{{amount}}</p>
    <p><strong>订单日期：</strong>{{orderDate}}</p>
  </div>
  
  <p>您的服务将在付款确认后立即激活。如有任何问题，请联系客服。</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #666; font-size: 12px;">
    此邮件由 {{siteName}} 系统自动发送，请勿回复。<br>
    © {{currentYear}} {{siteName}}. 保留所有权利。
  </p>
</div>`,
  },
  change_email: {
    subject: "邮箱变更验证 - {{siteName}}",
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #1890ff;">邮箱变更验证</h2>
  <p>您好，{{username}}！</p>
  <p>您正在 {{siteName}} 上更改邮箱地址。为确保您的账户安全，请使用以下验证码完成验证：</p>

  <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
    <span style="font-size: 24px; font-weight: bold; color: #1890ff;">{{verificationCode}}</span>
  </div>

  <p>此验证码将在 <strong>3分钟</strong> 后过期，请尽快完成验证。</p>
  <p><strong>新邮箱：</strong>{{email}}</p>
  <p>如果这不是您的操作，请忽略此邮件，您的原邮箱地址不会被更改。</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #666; font-size: 12px;">
    此邮件由 {{siteName}} 系统自动发送，请勿回复。<br>
    © {{currentYear}} {{siteName}}. 保留所有权利。
  </p>
</div>`,
  },
  sub_expiring: {
    subject: "{{siteName}} - 您的订阅即将到期",
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #e67e22;">订阅即将到期提醒</h2>
  <p>尊敬的 {{username}}，</p>
  <p>您在 {{siteName}} 的 <strong>{{subscriptionName}}</strong> 订阅将于 <strong>{{expiryDate}}</strong> 到期。</p>
  
  <p>为了避免服务中断，请及时续费您的订阅：</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{renewUrl}}" style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
      立即续费
    </a>
  </div>
  
  <p>如有任何问题，请联系我们的客服团队。</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #666; font-size: 12px;">
    此邮件由 {{siteName}} 系统自动发送，请勿回复。<br>
    © {{currentYear}} {{siteName}}. 保留所有权利。
  </p>
</div>`,
  },
  worker_reply: {
    subject: "{{siteName}} - 工单回复 #{{ticketNumber}}",
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #007bff;">工单回复通知</h2>
  <p>尊敬的 {{username}}，</p>
  <p>您的工单 <strong>#{{ticketNumber}} - {{ticketTitle}}</strong> 收到了新的回复：</p>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #007bff;">
    {{replyContent}}
  </div>
  
  <p>如需继续咨询，请登录您的账户查看详情并回复。</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{siteUrl}}/user/tickets" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
      查看工单详情
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #666; font-size: 12px;">
    此邮件由 {{siteName}} 系统自动发送，请勿回复。<br>
    © {{currentYear}} {{siteName}}. 保留所有权利。
  </p>
</div>`,
  },
  reset_password: {
    subject: "{{siteName}} - 重置密码请求",
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333;">重置密码</h2>
  <p>尊敬的 {{username}}，</p>
  <p>我们收到了您的密码重置请求。请点击下面的链接重置您的密码：</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{resetUrl}}" style="background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
      重置密码
    </a>
  </div>
  
  <p>此链接将在1小时后过期。如果您没有请求重置密码，请忽略此邮件。</p>
  <p style="color: #666; font-size: 14px;">
    如果按钮无法点击，请复制以下链接到浏览器地址栏：<br>
    {{resetUrl}}
  </p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #666; font-size: 12px;">
    此邮件由 {{siteName}} 系统自动发送，请勿回复。<br>
    © {{currentYear}} {{siteName}}. 保留所有权利。
  </p>
</div>`,
  },
};


function mergeTemplates(value: any) {
  const out: Record<string, { label: string; subject: string; bodyHtml: string }> = {};
  for (const [k, d] of Object.entries(DEFAULT_TEMPLATES)) {
    const p = PRESET_OVERRIDES[k] ?? {};
    const t = value?.[k] ?? {};
    const parsed = TemplateSchema.safeParse({
      subject: t.subject ?? p.subject ?? d.subject,
      bodyHtml: t.bodyHtml ?? p.bodyHtml ?? d.bodyHtml,
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

  const [row, noticeRow] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: KEY } }),
    prisma.appSetting.findUnique({ where: { key: NOTICE_KEY } }),
  ]);
  const templates = mergeTemplates((row?.valueJson as any) ?? {});
  const noticeDaysRaw = Number((noticeRow?.valueJson as any)?.noticeDays ?? 3);
  const noticeDays = Number.isFinite(noticeDaysRaw) ? Math.min(30, Math.max(1, Math.floor(noticeDaysRaw))) : 3;

  return NextResponse.json({ ok: true, data: { templates, noticeDays } });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);

  const noticeParsed = SaveNoticeSchema.safeParse(json);
  if (noticeParsed.success) {
    await prisma.appSetting.upsert({
      where: { key: NOTICE_KEY },
      create: { key: NOTICE_KEY, valueJson: { noticeDays: noticeParsed.data.noticeDays } },
      update: { valueJson: { noticeDays: noticeParsed.data.noticeDays } },
    });
    return NextResponse.json({ ok: true });
  }

  const parsed = SaveTemplateSchema.safeParse(json);
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
