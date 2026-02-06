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

const PatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(20000).optional().or(z.literal("")),
  enabled: z.boolean().optional(),
  visible: z.boolean().optional(),
  serverAssignStrategy: z.enum(["ALL", "LOAD_BALANCE"]).optional(),
  pricing: PricingSchema,
  servers: z.array(PlanServerConfigInput).optional(),
});

export async function GET(_req: Request, { params }: any) {
  const p0 = await params;
  const id = p0?.id;
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const plan = await prisma.plan.findUnique({
    where: { id },
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

  if (!plan) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, plan });
}

export async function PATCH(req: Request, { params }: any) {
  const p0 = await params;
  const id = p0?.id;
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const p = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    // replace server configs if provided
    if (p.servers) {
      await tx.planServerConfig.deleteMany({ where: { planId: id } });
      if (p.servers.length) {
        await tx.planServerConfig.createMany({
          data: p.servers.map((s) => ({
            planId: id,
            embyServerId: s.embyServerId,
            templateEmbyUserId: s.templateEmbyUserId,
          })),
        });
      }
    }

    await tx.plan.update({
      where: { id },
      data: {
        name: p.name,
        description: p.description !== undefined ? (p.description ? p.description : null) : undefined,
        enabled: p.enabled,
        visible: p.visible,
        serverAssignStrategy: p.serverAssignStrategy,
        pricingJson: p.pricing !== undefined ? ((p.pricing as any) ?? null) : undefined,
      },
    });

    return tx.plan.findUnique({
      where: { id },
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
  });

  return NextResponse.json({ ok: true, plan: updated });
}

export async function DELETE(_req: Request, { params }: any) {
  const p0 = await params;
  const id = p0?.id;
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Delete rule: block only when there are ACTIVE subscriptions.
  const activeCount = await prisma.subscription.count({ where: { planId: id, status: "ACTIVE" } });
  if (activeCount > 0) return NextResponse.json({ error: "plan_in_use", subscriptionCount: activeCount }, { status: 409 });

  // Keep historical subscriptions but detach them from the plan to satisfy FK constraints.
  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({ where: { planId: id }, data: { planId: null } });
    await tx.plan.delete({ where: { id } });
  });

  return NextResponse.json({ ok: true });
}
