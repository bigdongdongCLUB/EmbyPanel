export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

const PricingSchema = z
  .object({
    trial: z
      .object({
        priceCents: z.number().int().nonnegative().optional(),
        days: z.number().int().nonnegative().optional(),
      })
      .optional(),
    monthly: z.object({ priceCents: z.number().int().nonnegative() }).optional(),
    quarterly: z.object({ priceCents: z.number().int().nonnegative() }).optional(),
    halfYearly: z.object({ priceCents: z.number().int().nonnegative() }).optional(),
    yearly: z.object({ priceCents: z.number().int().nonnegative() }).optional(),
    twoYearly: z.object({ priceCents: z.number().int().nonnegative() }).optional(),
  })
  .optional();

const PlanServerConfigInput = z.object({
  embyServerId: z.string().min(1),
  templateEmbyUserId: z.string().min(1),
});

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(20000).optional().or(z.literal("")),
  enabled: z.boolean().optional(),
  visible: z.boolean().optional(),
  serverAssignStrategy: z.enum(["ALL", "LOAD_BALANCE"]).optional(),
  pricing: PricingSchema,
  servers: z.array(PlanServerConfigInput).optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const plans = await prisma.plan.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      enabled: true,
      visible: true,
      serverAssignStrategy: true,
      pricingJson: true,
      createdAt: true,
      updatedAt: true,
      serverConfigs: {
        select: {
          id: true,
          embyServerId: true,
          templateEmbyUserId: true,
          embyServer: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Define subscription count as ACTIVE subscriptions only (matches delete rule).
  const counts = await prisma.subscription.groupBy({
    by: ["planId"],
    _count: { _all: true },
    where: {
      status: "ACTIVE",
      planId: { in: plans.map((p) => p.id) },
    },
  });
  const countMap = new Map<string, number>();
  for (const c of counts) {
    if (c.planId) countMap.set(c.planId, c._count._all);
  }

  const plansWithCounts = plans.map((p) => ({ ...p, subscriptionCount: countMap.get(p.id) ?? 0 }));

  return NextResponse.json({ ok: true, plans: plansWithCounts });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const p = parsed.data;

  const plan = await prisma.plan.create({
    data: {
      name: p.name,
      description: p.description ? p.description : null,
      enabled: p.enabled ?? true,
      visible: p.visible ?? true,
      serverAssignStrategy: p.serverAssignStrategy ?? "LOAD_BALANCE",
      pricingJson: (p.pricing as any) ?? null,
      serverConfigs: p.servers?.length
        ? {
            create: p.servers.map((s) => ({
              embyServerId: s.embyServerId,
              templateEmbyUserId: s.templateEmbyUserId,
            })),
          }
        : undefined,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: plan.id });
}
