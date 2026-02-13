export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const KEY = "invite_rebate";

const Schema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["LOOP", "FIRST_ONLY"]).default("LOOP"),
  level: z.coerce.number().int().min(1).max(3).default(3),
  rate1: z.coerce.number().min(0).max(100).default(10),
  rate2: z.coerce.number().min(0).max(100).default(5),
  rate3: z.coerce.number().min(0).max(100).default(2),
  enabledAt: z.string().datetime().optional(),
});

const DEFAULTS = {
  enabled: false,
  mode: "LOOP" as const,
  level: 3,
  rate1: 10,
  rate2: 5,
  rate3: 2,
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const raw = (row?.valueJson as any) ?? {};

  const parsed = Schema.safeParse({
    enabled: raw.enabled ?? DEFAULTS.enabled,
    mode: raw.mode ?? DEFAULTS.mode,
    level: raw.level ?? DEFAULTS.level,
    rate1: raw.rate1 ?? DEFAULTS.rate1,
    rate2: raw.rate2 ?? DEFAULTS.rate2,
    rate3: raw.rate3 ?? DEFAULTS.rate3,
    enabledAt: raw.enabledAt,
  });

  const data = parsed.success ? parsed.data : DEFAULTS;
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const p = parsed.data;

  const current = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const cur = (current?.valueJson as any) ?? {};
  const enabledAt = p.enabled
    ? (cur.enabledAt || (cur.enabled ? undefined : new Date().toISOString()) || p.enabledAt || new Date().toISOString())
    : cur.enabledAt;

  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, valueJson: { ...p, enabledAt: enabledAt ?? null } },
    update: { valueJson: { ...p, enabledAt: enabledAt ?? null } },
  });

  return NextResponse.json({ ok: true });
}
