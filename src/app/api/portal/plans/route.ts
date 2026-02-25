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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const plans = await prisma.plan.findMany({
    where: { enabled: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      pricingJson: true,
    },
  });

  return NextResponse.json({
    ok: true,
    plans: plans.map((p) => {
      const pr: any = p.pricingJson ?? {};
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        prices: {
          trialYuan: centsToYuan(pr?.trial?.priceCents),
          trialHours: typeof pr?.trial?.hours === "number" ? pr.trial.hours : (typeof pr?.trial?.days === "number" ? pr.trial.days * 24 : null),
          monthlyYuan: centsToYuan(pr?.monthly?.priceCents),
          quarterlyYuan: centsToYuan(pr?.quarterly?.priceCents),
          halfYearlyYuan: centsToYuan(pr?.halfYearly?.priceCents),
          yearlyYuan: centsToYuan(pr?.yearly?.priceCents),
          twoYearlyYuan: centsToYuan(pr?.twoYearly?.priceCents),
        },
      };
    }),
  });
}
