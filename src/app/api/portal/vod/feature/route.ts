export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username as string | undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [row, user] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "vod_settings" } }),
    prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        subscriptions: {
          where: { status: "ACTIVE", endAt: { gt: new Date() }, planId: { not: null } },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ]);

  const enabled = Boolean((row?.valueJson as any)?.enabled ?? false);
  const hasActivePlan = Boolean(user?.subscriptions?.length);
  const canRequest = enabled && hasActivePlan;
  const reason = !enabled ? "目前点播功能暂未开启" : !hasActivePlan ? "无有效订阅计划，无法提交点播申请" : null;

  return NextResponse.json({ ok: true, enabled, canRequest, reason });
}
