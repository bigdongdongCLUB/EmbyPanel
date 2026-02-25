export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const BodySchema = z.object({
  planId: z.string().min(1),
  payCycle: z.enum(["TRIAL", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "TWO_YEARLY"]),
  days: z.number().int().min(1),
  trialHours: z.number().int().min(1).max(168).optional(),
  amountYuan: z.number().int().min(0),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId }, select: { id: true, enabled: true, visible: true } });
  if (!plan || !plan.enabled || !plan.visible) return NextResponse.json({ error: "plan_not_available" }, { status: 400 });

  if (parsed.data.payCycle === "TRIAL") {
    const [trialPaidCount, trialSubCount] = await Promise.all([
      prisma.serviceOrder.count({ where: { userId: user.id, payCycle: "TRIAL", status: "PAID" } }),
      prisma.subscription.count({ where: { userId: user.id, payCycle: "TRIAL" } }),
    ]);
    if (trialPaidCount > 0 || trialSubCount > 0) {
      return NextResponse.json({ error: "trial_already_used" }, { status: 400 });
    }
  }

  const trialHours = parsed.data.payCycle === "TRIAL" ? (parsed.data.trialHours ?? parsed.data.days * 24) : null;
  if (parsed.data.payCycle === "TRIAL") {
    if (!trialHours || !Number.isFinite(trialHours) || trialHours < 1 || trialHours > 168) {
      return NextResponse.json({ error: "trial_hours_invalid" }, { status: 400 });
    }
  }

  const order = await prisma.serviceOrder.create({
    data: {
      userId: user.id,
      planId: parsed.data.planId,
      payCycle: parsed.data.payCycle,
      days: parsed.data.days,
      amountCents: parsed.data.amountYuan * 100,
      trialHours,
      status: "PENDING",
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, orderId: order.id });
}
