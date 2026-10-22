export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertOrderEligibility, lockOrderUser, quoteOrder } from "@/lib/order-pricing";

const BodySchema = z.object({
  planId: z.string().min(1),
  payCycle: z.enum(["TRIAL", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "TWO_YEARLY"]),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as typeof session & { username?: string }).username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  try {
    const order = await prisma.$transaction(async (tx) => {
      await lockOrderUser(tx, user.id);
      const plan = await tx.plan.findUnique({ where: { id: parsed.data.planId } });
      if (!plan || !plan.enabled || !plan.visible) throw new Error("plan_not_available");
      const quote = quoteOrder(plan.pricingJson, parsed.data.payCycle);
      await assertOrderEligibility(tx, user.id, parsed.data.payCycle === "TRIAL");
      return tx.serviceOrder.create({
        data: { userId: user.id, planId: plan.id, payCycle: parsed.data.payCycle, ...quote, status: "PENDING" },
        select: { id: true },
      });
    });
    return NextResponse.json({ ok: true, orderId: order.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "order_create_failed";
    const expected = ["plan_not_available", "plan_cycle_not_available", "trial_hours_invalid", "trial_not_available", "user_disabled"];
    return NextResponse.json({ error: expected.includes(message) ? message : "order_create_failed" }, { status: expected.includes(message) ? 400 : 500 });
  }
}
