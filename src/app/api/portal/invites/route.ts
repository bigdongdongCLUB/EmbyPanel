export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const CODE_MAP_KEY = "invite_code_map";
const REL_KEY = "invite_relations";

type Rel = { inviterUserId: string; inviteCode: string; createdAt: string };

function payCycleText(v?: string | null) {
  const m: Record<string, string> = {
    TRIAL: "试用",
    MONTHLY: "月付",
    QUARTERLY: "季付",
    HALF_YEARLY: "半年付",
    YEARLY: "年付",
    TWO_YEARLY: "两年付",
  };
  return v ? m[v] ?? v : "-";
}

function fmtYmd(v?: Date | string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { username }, select: { id: true, username: true } });
  if (!me) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [codeRow, relRow, rebateRow] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: CODE_MAP_KEY } }),
    prisma.appSetting.findUnique({ where: { key: REL_KEY } }),
    prisma.appSetting.findUnique({ where: { key: "invite_rebate" } }),
  ]);

  const codeMap = ((codeRow?.valueJson as any) ?? {}) as Record<string, string>;
  const relMap = ((relRow?.valueJson as any) ?? {}) as Record<string, Rel>;

  const inviteCode = (codeMap[me.id] || me.username).toUpperCase();

  const invitedUserIds = Object.entries(relMap)
    .filter(([, r]) => r?.inviterUserId === me.id)
    .map(([uid]) => uid);

  const rebate = (rebateRow?.valueJson as any) ?? {};
  const rebateEnabled = !!rebate.enabled;
  const rebateMode = rebate.mode === "FIRST_ONLY" ? "FIRST_ONLY" : "LOOP";
  const rate1 = Number(rebate.rate1 ?? 0);

  if (!invitedUserIds.length) {
    return NextResponse.json({ ok: true, inviteCode, rows: [] });
  }

  const [invitedUsers, paidOrders] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: invitedUserIds } },
      select: { id: true, username: true, createdAt: true },
    }),
    prisma.serviceOrder.findMany({
      where: { userId: { in: invitedUserIds }, status: "PAID" },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
      select: {
        userId: true,
        payCycle: true,
        amountCents: true,
        createdAt: true,
        paidAt: true,
        plan: { select: { name: true } },
      },
    }),
  ]);

  const firstPaidByUser = new Map<string, (typeof paidOrders)[number]>();
  const latestPaidByUser = new Map<string, (typeof paidOrders)[number]>();
  for (const o of paidOrders) {
    if (!firstPaidByUser.has(o.userId)) firstPaidByUser.set(o.userId, o);
    latestPaidByUser.set(o.userId, o);
  }

  const rows = invitedUsers
    .map((u) => {
      const firstOrder = firstPaidByUser.get(u.id);
      const latestOrder = latestPaidByUser.get(u.id);
      const o = rebateMode === "FIRST_ONLY" ? firstOrder : latestOrder;
      const rebateAmountYuan = o && rebateEnabled ? (((o.amountCents ?? 0) / 100) * (Number.isFinite(rate1) ? rate1 : 0)) / 100 : 0;
      return {
        invitedUsername: u.username,
        registerDate: fmtYmd(u.createdAt),
        planName: o?.plan?.name ?? "-",
        payCycle: payCycleText(o?.payCycle),
        paidAt: fmtYmd(o?.paidAt ?? o?.createdAt ?? null),
        rebateAmount: o ? rebateAmountYuan.toFixed(2) : "0.00",
      };
    })
    .sort((a, b) => b.registerDate.localeCompare(a.registerDate));

  return NextResponse.json({ ok: true, inviteCode, rows });
}
