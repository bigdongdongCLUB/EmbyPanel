export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
  note: z.string().max(500).optional(),
});

function randomCode16() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function threeYearsAgo(now = new Date()) {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - 3);
  return d;
}

async function loadRecentCardCodeSet(cutoff: Date): Promise<Set<string>> {
  const cardCodeModel: any = (prisma as any).cardCode;
  const rows: Array<{ code: string }> = cardCodeModel
    ? await cardCodeModel.findMany({
        where: { createdAt: { gte: cutoff } },
        select: { code: true },
      })
    : await prisma.$queryRaw<Array<{ code: string }>>`SELECT "code" FROM "CardCode" WHERE "createdAt" >= ${cutoff}`;
  return new Set<string>(rows.map((r) => String(r.code || "").toUpperCase()).filter(Boolean));
}

function nextUniqueCardCode(usedCodes: Set<string>) {
  for (let i = 0; i < 2000; i++) {
    const code = randomCode16();
    if (usedCodes.has(code)) continue;
    usedCodes.add(code);
    return code;
  }
  throw new Error("card_code_generate_exhausted");
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

function shanghaiMonthRange(now = new Date()) {
  const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
  const shanghaiNow = new Date(now.getTime() + shanghaiOffsetMs);
  const year = shanghaiNow.getUTCFullYear();
  const month = shanghaiNow.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1) - shanghaiOffsetMs),
    end: new Date(Date.UTC(year, month + 1, 1) - shanghaiOffsetMs),
  };
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
              { note: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const plans = await prisma.plan.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
    const monthRange = shanghaiMonthRange();

    const cardCodeModel: any = (prisma as any).cardCode;
    if (!cardCodeModel) {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT c."id", c."code", c."type", c."status", c."amountCents", c."payCycle", c."subscriptionDays", c."note", c."createdAt", c."usedAt",
               p."id" as "planId", p."name" as "planName",
               u."id" as "usedByUserId", u."username" as "usedByUsername", u."email" as "usedByEmail"
        FROM "CardCode" c
        LEFT JOIN "Plan" p ON p."id" = c."planId"
        LEFT JOIN "User" u ON u."id" = c."usedByUserId"
        ORDER BY c."createdAt" DESC
        LIMIT 500
      `;
      const totalRes = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as c FROM "CardCode"`;
      const usedRes = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as c FROM "CardCode" WHERE "status"='USED'`;
      const unusedRes = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as c FROM "CardCode" WHERE "status"='UNUSED'`;
      const balanceMonthUsedRes = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as c FROM "CardCode" WHERE "type"='BALANCE' AND "status"='USED' AND "usedAt" >= ${monthRange.start} AND "usedAt" < ${monthRange.end}`;
      const subMonthUsedRes = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as c FROM "CardCode" WHERE "type"='SUBSCRIPTION' AND "status"='USED' AND "usedAt" >= ${monthRange.start} AND "usedAt" < ${monthRange.end}`;

      return NextResponse.json({
        ok: true,
        summary: {
          total: Number(totalRes?.[0]?.c ?? 0),
          used: Number(usedRes?.[0]?.c ?? 0),
          unused: Number(unusedRes?.[0]?.c ?? 0),
          balanceMonthUsed: Number(balanceMonthUsedRes?.[0]?.c ?? 0),
          subMonthUsed: Number(subMonthUsedRes?.[0]?.c ?? 0),
        },
        rows: rows.map((r) => ({
          id: r.id,
          code: r.code,
          type: r.type,
          status: r.status,
          amountCents: r.amountCents,
          payCycle: r.payCycle,
          subscriptionDays: r.subscriptionDays,
          note: r.note,
          createdAt: r.createdAt,
          usedAt: r.usedAt,
          usedByUser: r.usedByUserId ? { id: r.usedByUserId, username: r.usedByUsername, email: r.usedByEmail } : null,
          plan: r.planId ? { id: r.planId, name: r.planName } : null,
        })),
        plans,
      });
    }

    const [rows, total, used, unused, balanceMonthUsed, subMonthUsed] = await Promise.all([
      cardCodeModel.findMany({
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
          note: true,
          createdAt: true,
          usedAt: true,
          usedByUser: { select: { id: true, username: true, email: true } },
          plan: { select: { id: true, name: true } },
        },
      }),
      cardCodeModel.count(),
      cardCodeModel.count({ where: { status: "USED" } }),
      cardCodeModel.count({ where: { status: "UNUSED" } }),
      cardCodeModel.count({ where: { type: "BALANCE", status: "USED", usedAt: { gte: monthRange.start, lt: monthRange.end } } }),
      cardCodeModel.count({ where: { type: "SUBSCRIPTION", status: "USED", usedAt: { gte: monthRange.start, lt: monthRange.end } } }),
    ]);

    return NextResponse.json({ ok: true, summary: { total, used, unused, balanceMonthUsed, subMonthUsed }, rows, plans });
  } catch (e: any) {
    return NextResponse.json({ error: "card_codes_query_failed", message: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = new URL(req.url);
    const id = (url.searchParams.get("id") ?? "").trim();
    if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

    const cardCodeModel: any = (prisma as any).cardCode;
    if (cardCodeModel) {
      await cardCodeModel.delete({ where: { id } });
    } else {
      await prisma.$executeRaw`DELETE FROM "CardCode" WHERE "id"=${id}`;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "card_codes_delete_failed", message: String(e?.message ?? e) }, { status: 500 });
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

    const recentCodes = await loadRecentCardCodeSet(threeYearsAgo());
    const data: any[] = [];
    while (data.length < p.count) {
      const code = nextUniqueCardCode(recentCodes);
      data.push({
        code,
        type: p.type,
        amountCents: p.type === "BALANCE" ? Math.round((p.amountYuan ?? 0) * 100) : null,
        planId: p.type === "SUBSCRIPTION" ? p.planId : null,
        payCycle: p.type === "SUBSCRIPTION" ? (p.payCycle ?? "MONTHLY") : null,
        subscriptionDays: p.type === "SUBSCRIPTION" ? days : null,
        note: p.note?.trim() || null,
      });
    }

    const cardCodeModel: any = (prisma as any).cardCode;
    if (cardCodeModel) {
      const created: any[] = [];
      for (const item of data) {
        let current = item;
        for (let attempt = 0; attempt < 20; attempt++) {
          try {
            const row = await cardCodeModel.create({ data: current, select: { code: true } });
            created.push(row);
            break;
          } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
              current = { ...current, code: nextUniqueCardCode(recentCodes) };
              continue;
            }
            throw e;
          }
        }
      }
      if (created.length !== data.length) throw new Error("card_codes_create_incomplete");
      return NextResponse.json({ ok: true, created: created.length, preview: created.slice(0, 20).map((x) => x.code) });
    } else {
      const createdCodes: string[] = [];
      for (const d of data) {
        let current = d;
        for (let attempt = 0; attempt < 20; attempt++) {
          const affected = await prisma.$executeRaw`
          INSERT INTO "CardCode" ("id","code","type","status","amountCents","planId","payCycle","subscriptionDays","note","createdAt","updatedAt")
          VALUES (${crypto.randomUUID()}, ${current.code}, ${current.type}::"CardCodeType", 'UNUSED'::"CardCodeStatus", ${current.amountCents}, ${current.planId}, ${current.payCycle}::"PayCycle", ${current.subscriptionDays}, ${current.note}, NOW(), NOW())
          ON CONFLICT ("code") DO NOTHING
        `;
          if (affected > 0) {
            createdCodes.push(current.code);
            break;
          }
          current = { ...current, code: nextUniqueCardCode(recentCodes) };
        }
      }
      if (createdCodes.length !== data.length) throw new Error("card_codes_create_incomplete");
      return NextResponse.json({ ok: true, created: createdCodes.length, preview: createdCodes.slice(0, 20) });
    }
  } catch (e: any) {
    return NextResponse.json({ error: "card_codes_create_failed", message: String(e?.message ?? e) }, { status: 500 });
  }
}
