export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const KEY = "anomaly_penalty_config";

const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  durationMinutes: z.number().int().min(1).max(120).optional(),
});

function normalize(v: any) {
  const enabled = typeof v?.enabled === "boolean" ? v.enabled : true;
  const d = Number(v?.durationMinutes ?? 5);
  const durationMinutes = Number.isFinite(d) ? Math.max(1, Math.min(120, Math.trunc(d))) : 5;
  return { enabled, durationMinutes };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return NextResponse.json({ ok: true, data: normalize(row?.valueJson ?? {}) });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const p = PatchSchema.safeParse(json);
  if (!p.success) return NextResponse.json({ error: "invalid_payload", issues: p.error.issues }, { status: 400 });

  const prev = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const next = normalize({ ...(prev?.valueJson as any), ...p.data });

  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, valueJson: next },
    update: { valueJson: next },
  });

  return NextResponse.json({ ok: true, data: next });
}
