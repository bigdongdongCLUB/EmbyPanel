export const runtime = "nodejs";

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { decryptString } from "@/lib/crypto";
import { MAIL_TEMPLATES_KEY, resolveMailTemplate } from "@/lib/mail-templates";

const MAIL_KEY = "mail_basic";
const TEMPLATE_KEY = MAIL_TEMPLATES_KEY;
const NOTICE_KEY = "subscription_notice";
const REMINDER_STATE_KEY = "subscription_notice_sent_state";
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

    const mail = isRecord(mailRow?.valueJson) ? mailRow.valueJson : {};
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

    const notice = isRecord(noticeRow?.valueJson) ? noticeRow.valueJson : {};
    const noticeDaysRaw = Number(notice.noticeDays ?? 3);
    const noticeDays = Number.isFinite(noticeDaysRaw) ? Math.min(30, Math.max(1, Math.floor(noticeDaysRaw))) : 3;

    const template = resolveMailTemplate(tplRow?.valueJson, "sub_expiring");
    const subjectTpl = template.subject;
    const bodyTpl = template.bodyHtml;

    const sentState = (isRecord(stateRow?.valueJson) ? stateRow.valueJson : {}) as Record<string, { endAt: string; sentAt: string }>;

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

    const site = isRecord(siteRow?.valueJson) ? siteRow.valueJson : {};
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
      // 去重逻辑：在通知窗口内（noticeDays 天）只发送一次
      // 如果该订阅已发送过且 endAt 未变，跳过（避免重复发送）
      if (prev?.endAt === endAtIso) continue;

      // 剩余天数计算：向下取整，例如剩余 2 天 23 小时 = 2 天
      const remainingDays = Math.floor((new Date(sub.endAt).getTime() - now.getTime()) / (24 * 3600 * 1000));
      // 只有剩余天数 < noticeDays 时才发送（例如 noticeDays=3，剩余 0、1、2 天时发送）
      if (remainingDays >= noticeDays) continue;

      const vars = {
        siteName,
        siteUrl,
        username: u.username,
        email: u.email,
        expireAt: formatYmd(new Date(sub.endAt)),
        expiryDate: formatYmd(new Date(sub.endAt)),
        subscriptionName: String(sub.plan?.name || "订阅"),
        renewUrl: siteUrl ? `${siteUrl.replace(/\/+$/, "")}` : "/",
        remainingDays: String(remainingDays),
        currentYear: String(new Date().getFullYear()),
      };

      try {
        await transporter.sendMail({
          from: mail.fromName ? `${String(mail.fromName)} <${String(mail.fromEmail)}>` : String(mail.fromEmail),
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

    // 清理过期的发送记录（超过 noticeDays + 7 天的记录）
    const cleanupCutoff = now.getTime() - (noticeDays + 7) * 24 * 3600 * 1000;
    for (const k of Object.keys(sentState)) {
      const sentAtMs = Date.parse(sentState[k]?.sentAt || "");
      if (!Number.isFinite(sentAtMs) || sentAtMs < cleanupCutoff) {
        delete sentState[k];
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
  } catch (e: unknown) {
    const finishedAt = new Date();
    const message = getErrorMessage(e);
    await prisma.jobRun.update({ where: { id: job.id }, data: { finishedAt, ok: false, message } });
    return NextResponse.json({ error: "job_failed", message, jobRunId: job.id }, { status: 500 });
  }
}
