export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function daysLeft(endAt?: Date | null) {
  if (!endAt) return 0;
  const diff = endAt.getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 3600 * 1000));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  const role = (session as any)?.role;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (role === "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      balanceCents: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        orderBy: { endAt: "desc" },
        take: 1,
        select: { endAt: true, startAt: true, payCycle: true, plan: { select: { name: true } } },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sub = user.subscriptions?.[0] ?? null;
  const endAt = sub?.endAt ?? null;

  return NextResponse.json({
    ok: true,
    dashboard: {
      balanceYuan: (user.balanceCents ?? 0) / 100,
      subscriptionEndAt: endAt,
      subscriptionPlan: sub?.plan?.name ?? "无订阅",
      remainingDays: daysLeft(endAt),
    },
    announcement: {
      title: "系统公告",
      content: "欢迎使用用户中心。购买订阅或使用卡密兑换后，可在此查看最新订阅状态与剩余时间。",
    },
  });
}
