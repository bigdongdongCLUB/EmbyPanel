export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const CreateSchema = z.object({
  count: z.number().int().min(1).max(500),
  type: z.enum(["BALANCE", "SUBSCRIPTION"]),
  amountYuan: z.number().int().min(1).optional(),
  planId: z.string().min(1).optional(),
  payCycle: z.enum(["TRIAL", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "TWO_YEARLY"]).optional(),
  subscriptionDays: z.number().int().min(1).max(3650).optional(),
  batchTag: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});

function randomCode16() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function cycleDays(payCycle?: string) {
  switch (payCycle) {
    case "TRIAL":
      return 7;
    case "MONTHLY":
      return 30;
    case "QUARTERLY":
      return 90;
    case "HALF_YEARLY":
      return 180;
    case "YEARLY":
      return 365;
    case "TWO_YEARLY":
      return 730;
    default:
      return 30;
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const type = (url.searchParams.get("type") ?? "").trim();
    const status = (url.searchParams.get("status") ?? "").trim();

    const where: any = {
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { batchTag: { contains: q, mode: "insensitive" } },
              { note: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total, used, balanceTotal, subTotal, plans] = await Promise.all([
      prisma.cardCode.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true,
          code: true,
          type: true,
          status: true,
          amountCents: true,
          payCycle: true,
          subscriptionDays: true,
          batchTag: true,
          note: true,
          createdAt: true,
          usedAt: true,
          plan: { select: { id: true, name: true } },
        },
      }),
      prisma.cardCode.count(),
      prisma.cardCode.count({ where: { status: "USED" } }),
      prisma.cardCode.count({ where: { type: "BALANCE" } }),
      prisma.cardCode.count({ where: { type: "SUBSCRIPTION" } }),
      prisma.plan.findMany({ where: { enabled: true }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
    ]);

    return NextResponse.json({
      ok: true,
      summary: { total, used, balanceTotal, subTotal },
      rows,
      plans,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "card_codes_query_failed", message: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => null);
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

    const p = parsed.data;
    if (p.type === "BALANCE" && (!p.amountYuan || p.amountYuan <= 0)) {
      return NextResponse.json({ error: "amount_required" }, { status: 400 });
    }
    if (p.type === "SUBSCRIPTION" && !p.planId) {
      return NextResponse.json({ error: "plan_required" }, { status: 400 });
    }

    const days = p.type === "SUBSCRIPTION" ? p.subscriptionDays ?? cycleDays(p.payCycle) : undefined;

    const data: any[] = [];
    const used = new Set<string>();
    while (data.length < p.count) {
      const code = randomCode16();
      if (used.has(code)) continue;
      used.add(code);
      data.push({
        code,
        type: p.type,
        amountCents: p.type === "BALANCE" ? Math.round((p.amountYuan ?? 0) * 100) : null,
        planId: p.type === "SUBSCRIPTION" ? p.planId : null,
        payCycle: p.type === "SUBSCRIPTION" ? (p.payCycle ?? "MONTHLY") : null,
        subscriptionDays: p.type === "SUBSCRIPTION" ? days : null,
        batchTag: p.batchTag?.trim() || null,
        note: p.note?.trim() || null,
      });
    }

    await prisma.cardCode.createMany({ data, skipDuplicates: true });

    return NextResponse.json({ ok: true, created: data.length, preview: data.slice(0, 20).map((x) => x.code) });
  } catch (e: any) {
    return NextResponse.json({ error: "card_codes_create_failed", message: String(e?.message ?? e) }, { status: 500 });
  }
}
