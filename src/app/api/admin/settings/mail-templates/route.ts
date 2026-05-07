export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { DEFAULT_MAIL_TEMPLATES, MAIL_TEMPLATES_KEY, isMailTemplateKey, mergeMailTemplates } from "@/lib/mail-templates";

const KEY = MAIL_TEMPLATES_KEY;
const NOTICE_KEY = "subscription_notice";

const SaveTemplateSchema = z.object({
  key: z.string().min(1),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1).max(100_000),
});

const SaveNoticeSchema = z.object({
  noticeDays: z.coerce.number().int().min(1).max(30),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [row, noticeRow] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: KEY } }),
    prisma.appSetting.findUnique({ where: { key: NOTICE_KEY } }),
  ]);
  const templates = mergeMailTemplates(row?.valueJson);
  const notice = isRecord(noticeRow?.valueJson) ? noticeRow.valueJson : {};
  const noticeDaysRaw = Number(notice.noticeDays ?? 3);
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
  if (!isMailTemplateKey(key)) return NextResponse.json({ error: "invalid_template_key" }, { status: 400 });

  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const current = isRecord(row?.valueJson) ? { ...row.valueJson } : {};
  const defaultTemplate = DEFAULT_MAIL_TEMPLATES[key];
  const isDefaultTemplate = subject === defaultTemplate.subject && bodyHtml === defaultTemplate.bodyHtml;

  if (isDefaultTemplate) {
    delete current[key];
  } else {
    current[key] = { subject, bodyHtml };
  }

  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, valueJson: current },
    update: { valueJson: current },
  });

  return NextResponse.json({ ok: true, defaultTemplate: isDefaultTemplate });
}
