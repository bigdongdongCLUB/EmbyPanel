export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function centsToYuan(v: any) {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  return Math.round(v / 100);
}

function cycleDays(cycle: string, trialDays?: number | null) {
  switch (cycle) {
    case "TRIAL":
      return trialDays && trialDays > 0 ? trialDays : 0;
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
      return 0;
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const { id } = await ctx.params;
  const plan = await prisma.plan.findUnique({
    where: { id },
    select: { id: true, name: true, description: true, enabled: true, visible: true, pricingJson: true },
  });
  if (!plan || !plan.enabled || !plan.visible) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const pr: any = plan.pricingJson ?? {};
  const trialHasPrice = typeof pr?.trial?.priceCents === "number";
  const trialHasDays = typeof pr?.trial?.days === "number" && pr.trial.days > 0;

  const [trialPaidCount, trialSubCount] = await Promise.all([
    prisma.serviceOrder.count({ where: { userId: user.id, payCycle: "TRIAL", status: "PAID" } }),
    prisma.subscription.count({ where: { userId: user.id, payCycle: "TRIAL" } }),
  ]);
  const trialUsed = trialPaidCount > 0 || trialSubCount > 0;

  const cycles = [
    {
      key: "TRIAL",
      label: "试用",
      priceYuan: centsToYuan(pr?.trial?.priceCents),
      days: cycleDays("TRIAL", pr?.trial?.days),
      available: trialHasPrice && trialHasDays && !trialUsed,
      reason: trialUsed ? "每个用户仅可试用一次" : null,
    },
    { key: "MONTHLY", label: "月付", priceYuan: centsToYuan(pr?.monthly?.priceCents), days: 30, available: typeof pr?.monthly?.priceCents === "number" },
    { key: "QUARTERLY", label: "季付", priceYuan: centsToYuan(pr?.quarterly?.priceCents), days: 90, available: typeof pr?.quarterly?.priceCents === "number" },
    { key: "HALF_YEARLY", label: "半年付", priceYuan: centsToYuan(pr?.halfYearly?.priceCents), days: 180, available: typeof pr?.halfYearly?.priceCents === "number" },
    { key: "YEARLY", label: "年付", priceYuan: centsToYuan(pr?.yearly?.priceCents), days: 365, available: typeof pr?.yearly?.priceCents === "number" },
    { key: "TWO_YEARLY", label: "两年付", priceYuan: centsToYuan(pr?.twoYearly?.priceCents), days: 730, available: typeof pr?.twoYearly?.priceCents === "number" },
  ];

  return NextResponse.json({ ok: true, plan: { id: plan.id, name: plan.name, description: plan.description }, cycles });
}
