export const runtime = "nodejs";

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { decryptString } from "@/lib/crypto";

const MAIL_KEY = "mail_basic";
const TEMPLATE_KEY = "mail_templates";
const NOTICE_KEY = "subscription_notice";
const REMINDER_STATE_KEY = "subscription_notice_sent_state";
const SITE_KEY = "site_basic";

function decodePassword(value: any): string {
  try {
    if (value?.smtpPasswordEnc && value?.smtpPasswordIv && value?.smtpPasswordTag) {
      return decryptString({ enc: value.smtpPasswordEnc, iv: value.smtpPasswordIv, tag: value.smtpPasswordTag });
    }
  } catch {}
  return "";
}

function formatYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function applyVars(text: string, vars: Record<string, string>) {
  let out = text;
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v);
  return out;
}

export async function POST(req: Request) {
  const internalSecret = (process.env.INTERNAL_JOBS_SECRET ?? "").trim();
  const headerInternalSecret = (req.headers.get("x-internal-jobs-secret") ?? "").trim();

  if (internalSecret && headerInternalSecret) {
    if (internalSecret !== headerInternalSecret) return NextResponse.json({ error: "invalid_internal_jobs_secret" }, { status: 401 });
  } else {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const startedAt = new Date();
  const job = await prisma.jobRun.create({ data: { jobName: "subscription-expiry-reminder", startedAt } });

  try {
    const [mailRow, tplRow, noticeRow, stateRow, siteRow] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: MAIL_KEY } }),
    prisma.appSetting.findUnique({ where: { key: TEMPLATE_KEY } }),
    prisma.appSetting.findUnique({ where: { key: NOTICE_KEY } }),
    prisma.appSetting.findUnique({ where: { key: REMINDER_STATE_KEY } }),
    prisma.appSetting.findUnique({ where: { key: SITE_KEY } }),
  ]);

  const mail = (mailRow?.valueJson as any) ?? {};
  if (!mail?.enabled || !mail?.smtpHost || !mail?.fromEmail) {
    const finishedAt = new Date();
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: true, message: JSON.stringify({ skipped: true, reason: "mail_not_configured" }) } });
    return NextResponse.json({ ok: true, skipped: true, reason: "mail_not_configured", jobRunId: job.id });
  }

  const smtpPassword = decodePassword(mail);
  const transporter = nodemailer.createTransport({
    host: String(mail.smtpHost),
    port: Number(mail.smtpPort || 465),
    secure: String(mail.secureMode || "ssl") === "ssl",
    requireTLS: String(mail.secureMode || "ssl") === "starttls",
    auth: mail.smtpUser ? { user: String(mail.smtpUser), pass: smtpPassword } : undefined,
  });

  const noticeDaysRaw = Number((noticeRow?.valueJson as any)?.noticeDays ?? 3);
  const noticeDays = Number.isFinite(noticeDaysRaw) ? Math.min(30, Math.max(1, Math.floor(noticeDaysRaw))) : 3;

  const templateObj = ((tplRow?.valueJson as any) ?? {}) as Record<string, any>;
  const subjectTpl = String(templateObj?.sub_expiring?.subject ?? "{{siteName}} - 您的订阅即将到期");
  const bodyTpl = String(templateObj?.sub_expiring?.bodyHtml ?? "<p>您好 {{username}}，您的订阅将于 {{expiryDate}} 到期，请及时续费。</p>");

  const sentState = ((stateRow?.valueJson as any) ?? {}) as Record<string, { endAt: string; sentAt: string }>;

  const now = new Date();
  const maxEndAt = new Date(now.getTime() + noticeDays * 24 * 3600 * 1000 + 24 * 3600 * 1000);

  const users = await prisma.user.findMany({
    where: {
      enabled: true,
      expiryReminderEnabled: true,
      email: { not: null },
      subscriptions: {
        some: {
          status: "ACTIVE",
          endAt: { gt: now, lte: maxEndAt },
        },
      },
    },
    select: {
      username: true,
      email: true,
      subscriptions: {
        where: { status: "ACTIVE", endAt: { gt: now, lte: maxEndAt } },
        orderBy: { endAt: "asc" },
        take: 1,
        select: { id: true, endAt: true, plan: { select: { name: true } } },
      },
    },
  });

  const site = (siteRow?.valueJson as any) ?? {};
  const siteName = String(site?.siteName || "BestEmby");
  const siteUrl = String(process.env.NEXTAUTH_URL || process.env.WEB_INTERNAL_URL || "");

  let checked = 0;
  let sent = 0;
  let errors = 0;

  for (const u of users) {
    const sub = u.subscriptions?.[0];
    if (!sub || !u.email) continue;
    checked += 1;

    const key = String(sub.id);
    const endAtIso = new Date(sub.endAt).toISOString();
    const prev = sentState[key];
    if (prev?.endAt === endAtIso) continue;

    // 使用 Math.floor 向下取整，避免"3 天 5 小时"被算作 4 天而跳过
    const remainingDays = Math.floor((new Date(sub.endAt).getTime() - now.getTime()) / (24 * 3600 * 1000));
    // 剩余天数在 1~noticeDays 范围内才发送（包含 noticeDays 当天）
    if (remainingDays < 1 || remainingDays > noticeDays) continue;

    const vars = {
      siteName,
      siteUrl,
      username: u.username,
      email: u.email,
      expireAt: formatYmd(new Date(sub.endAt)),
      expiryDate: formatYmd(new Date(sub.endAt)),
      subscriptionName: String(sub.plan?.name || "订阅"),
      renewUrl: siteUrl ? `${siteUrl.replace(/\/+$/, "")}/portal/purchase` : "/portal/purchase",
      remainingDays: String(remainingDays),
      currentYear: String(new Date().getFullYear()),
    };

    try {
      await transporter.sendMail({
        from: mail.fromName ? `${mail.fromName} <${mail.fromEmail}>` : mail.fromEmail,
        to: u.email,
        subject: applyVars(subjectTpl, vars),
        html: applyVars(bodyTpl, vars),
      });
      sentState[key] = { endAt: endAtIso, sentAt: new Date().toISOString() };
      sent += 1;
    } catch {
      errors += 1;
    }
  }

  await prisma.appSetting.upsert({
    where: { key: REMINDER_STATE_KEY },
    create: { key: REMINDER_STATE_KEY, valueJson: sentState },
    update: { valueJson: sentState },
  });

    const finishedAt = new Date();
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: true, message: JSON.stringify({ noticeDays, checked, sent, errors }) } });
    return NextResponse.json({ ok: true, noticeDays, checked, sent, errors, jobRunId: job.id });
  } catch (e: any) {
    const finishedAt = new Date();
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: false, message: String(e?.message ?? e) } });
    return NextResponse.json({ error: "job_failed", message: String(e?.message ?? e), jobRunId: job.id }, { status: 500 });
  }
}
