export type MailTemplateKey =
  | "register_verify"
  | "reset_password"
  | "sub_expiring"
  | "sub_expired"
  | "order_confirm"
  | "worker_reply"
  | "invite_user";

export type MailTemplate = { label: string; subject: string; bodyHtml: string };

export const MAIL_TEMPLATES_KEY = "mail_templates";

export const DEFAULT_MAIL_TEMPLATES: Record<MailTemplateKey, MailTemplate> = {
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
  sub_expiring: {
    label: "订阅即将到期警告",
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
  sub_expired: {
    label: "订阅已过期通知",
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
    label: "订单确认邮件",
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
  worker_reply: {
    label: "工单回复通知",
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
  invite_user: {
    label: "用户邀请邮件",
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
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeTemplate(key: MailTemplateKey, saved: unknown): MailTemplate {
  const fallback = DEFAULT_MAIL_TEMPLATES[key];
  if (!isRecord(saved)) return fallback;

  const subject = typeof saved.subject === "string" && saved.subject.trim() ? saved.subject : fallback.subject;
  const bodyHtml = typeof saved.bodyHtml === "string" && saved.bodyHtml.trim() ? saved.bodyHtml : fallback.bodyHtml;
  return { label: fallback.label, subject, bodyHtml };
}

export function mergeMailTemplates(value: unknown): Record<MailTemplateKey, MailTemplate> {
  const saved = isRecord(value) ? value : {};
  return Object.fromEntries(
    (Object.keys(DEFAULT_MAIL_TEMPLATES) as MailTemplateKey[]).map((key) => [key, normalizeTemplate(key, saved[key])])
  ) as Record<MailTemplateKey, MailTemplate>;
}

export function resolveMailTemplate(value: unknown, key: MailTemplateKey): MailTemplate {
  const saved = isRecord(value) ? value[key] : undefined;
  return normalizeTemplate(key, saved);
}

export function isMailTemplateKey(key: string): key is MailTemplateKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_MAIL_TEMPLATES, key);
}
