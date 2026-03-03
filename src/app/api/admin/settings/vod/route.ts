export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const KEY = "vod_settings";

const Schema = z.object({
  enabled: z.boolean().default(false),
  tmdbApiKey: z.string().max(200).default(""),
  tmdbCacheHours: z.number().int().min(1).max(168).default(12),
  dailyTotalQuota: z.number().int().min(1).max(100).default(5),
});

const DEFAULTS = {
  enabled: false,
  tmdbApiKey: "",
  tmdbCacheHours: 12,
  dailyTotalQuota: 5,
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const data = { ...DEFAULTS, ...((row?.valueJson as object) ?? {}) };
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", detail: parsed.error.flatten() }, { status: 400 });

  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, valueJson: parsed.data },
    update: { valueJson: parsed.data },
  });

  return NextResponse.json({ ok: true });
}
