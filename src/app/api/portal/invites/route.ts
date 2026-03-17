export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const CODE_MAP_KEY = "invite_code_map";
const REL_KEY = "invite_relations";
const RECORD_KEY = "invite_rebate_records";

type Rel = { inviterUserId: string; inviteCode: string; createdAt: string };
type RebateRecord = {
  invitedUserId: string;
  rebateAmountCents: number;
  createdAt: string;
};

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

function getPlanPriceCents(pricingJson: any, payCycle?: string | null): number {
  const keyMap: Record<string, string> = {
    TRIAL: "trial",
    MONTHLY: "monthly",
    QUARTERLY: "quarterly",
    HALF_YEARLY: "halfYearly",
    YEARLY: "yearly",
    TWO_YEARLY: "twoYearly",
  };
  const key = keyMap[String(payCycle || "MONTHLY")] || "monthly";
  const n = Number(pricingJson?.[key]?.priceCents ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { username }, select: { id: true, username: true } });
  if (!me) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [codeRow, relRow, rebateRow, recordRow] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: CODE_MAP_KEY } }),
    prisma.appSetting.findUnique({ where: { key: REL_KEY } }),
    prisma.appSetting.findUnique({ where: { key: "invite_rebate" } }),
    prisma.appSetting.findUnique({ where: { key: RECORD_KEY } }),
  ]);

  const codeMap = ((codeRow?.valueJson as any) ?? {}) as Record<string, string>;
  const relMap = ((relRow?.valueJson as any) ?? {}) as Record<string, Rel>;
  const rebateRecords = (Array.isArray(recordRow?.valueJson) ? (recordRow!.valueJson as any[]) : []) as RebateRecord[];

  const inviteCode = (codeMap[me.id] || me.username).toUpperCase();

  const invitedUserIds = Object.entries(relMap)
    .filter(([, r]) => r?.inviterUserId === me.id)
    .map(([uid]) => uid);

  const rebate = (rebateRow?.valueJson as any) ?? {};
  const rebateEnabled = !!rebate.enabled;
  const rebateMode = rebate.mode === "FIRST_ONLY" ? "FIRST_ONLY" : "LOOP";
  const rebateLevel = Math.min(3, Math.max(1, Number(rebate.level ?? 3)));
  const rate1 = Number(rebate.rate1 ?? 0);
  const rate2 = Number(rebate.rate2 ?? 0);
  const rate3 = Number(rebate.rate3 ?? 0);
  const enabledAtMs = (() => {
    const v = rebate.enabledAt || rebateRow?.updatedAt;
    const t = v ? new Date(v).getTime() : NaN;
    return Number.isFinite(t) ? t : null;
  })();

  if (!invitedUserIds.length) {
    return NextResponse.json({
      ok: true,
      inviteCode,
      rebatePolicy: { enabled: rebateEnabled, mode: rebateMode, level: rebateLevel, rate1, rate2, rate3 },
      rows: [],
    });
  }

  const [invitedUsers, paidOrders, subscriptions] = await Promise.all([
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
        plan: { select: { name: true, pricingJson: true } },
      },
    }),
    prisma.subscription.findMany({
      where: { userId: { in: invitedUserIds } },
      orderBy: [{ createdAt: "asc" }],
      select: {
        userId: true,
        payCycle: true,
        createdAt: true,
        plan: { select: { name: true, pricingJson: true } },
      },
    }),
  ]);

  const firstPaidByUser = new Map<string, (typeof paidOrders)[number]>();
  const latestPaidByUser = new Map<string, (typeof paidOrders)[number]>();
  for (const o of paidOrders) {
    if (!firstPaidByUser.has(o.userId)) firstPaidByUser.set(o.userId, o);
    latestPaidByUser.set(o.userId, o);
  }

  const firstSubByUser = new Map<string, (typeof subscriptions)[number]>();
  const latestSubByUser = new Map<string, (typeof subscriptions)[number]>();
  for (const s of subscriptions) {
    if (!firstSubByUser.has(s.userId)) firstSubByUser.set(s.userId, s);
    latestSubByUser.set(s.userId, s);
  }

  const firstRecordByUser = new Map<string, RebateRecord>();
  const latestRecordByUser = new Map<string, RebateRecord>();
  for (const r of rebateRecords) {
    if (!r?.invitedUserId) continue;
    if (!firstRecordByUser.has(r.invitedUserId)) firstRecordByUser.set(r.invitedUserId, r);
    latestRecordByUser.set(r.invitedUserId, r);
  }

  const rows = invitedUsers
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((u) => {
      const firstOrder = firstPaidByUser.get(u.id);
      const latestOrder = latestPaidByUser.get(u.id);
      const firstSub = firstSubByUser.get(u.id);
      const latestSub = latestSubByUser.get(u.id);
      const firstRecord = firstRecordByUser.get(u.id);
      const latestRecord = latestRecordByUser.get(u.id);

      const orderRef = rebateMode === "FIRST_ONLY" ? firstOrder : latestOrder;
      const subRef = rebateMode === "FIRST_ONLY" ? firstSub : latestSub;
      const recordRef = rebateMode === "FIRST_ONLY" ? firstRecord : latestRecord;

      const planName = orderRef?.plan?.name ?? subRef?.plan?.name ?? "-";
      const payCycle = orderRef?.payCycle ?? subRef?.payCycle ?? null;

      const amountCents =
        Number(orderRef?.amountCents ?? 0) > 0
          ? Number(orderRef?.amountCents ?? 0)
          : getPlanPriceCents(subRef?.plan?.pricingJson, payCycle);

      const invitedAtMs = (() => {
        const v = relMap[u.id]?.createdAt;
        const t = v ? new Date(v).getTime() : NaN;
        return Number.isFinite(t) ? t : null;
      })();
      const eligibleByTime = enabledAtMs ? !!(invitedAtMs && invitedAtMs >= enabledAtMs) : true;

      // 用户端优先展示真实返利记录中的金额；无历史记录时再按旧规则兜底计算
      const rebateAmountYuan = recordRef
        ? Number(recordRef.rebateAmountCents || 0) / 100
        : rebateEnabled && eligibleByTime
          ? ((amountCents / 100) * (Number.isFinite(rate1) ? rate1 : 0)) / 100
          : 0;

      return {
        invitedUsername: u.username,
        registerDate: fmtYmd(u.createdAt),
        planName,
        payCycle: payCycleText(payCycle),
        paidAt: fmtYmd(orderRef?.paidAt ?? orderRef?.createdAt ?? subRef?.createdAt ?? null),
        rebateAmount: rebateAmountYuan.toFixed(2),
      };
    });

  return NextResponse.json({
    ok: true,
    inviteCode,
    rebatePolicy: { enabled: rebateEnabled, mode: rebateMode, level: rebateLevel, rate1, rate2, rate3 },
    rows,
  });
}
