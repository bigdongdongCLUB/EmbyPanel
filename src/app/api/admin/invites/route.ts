export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const REL_KEY = "invite_relations";
const RECORD_KEY = "invite_rebate_records";
const REBATE_CONFIG_KEY = "invite_rebate";

type Rel = { inviterUserId: string; inviteCode: string; createdAt: string };
type RecordRow = {
  id: string;
  inviterUserId: string;
  invitedUserId: string;
  level: number;
  rate: number;
  orderAmountCents: number;
  rebateAmountCents: number;
  createdAt: string;
  source?: string;
};

function ymd(v?: string) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [relRow, recordRow, rebateRow] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: REL_KEY } }),
    prisma.appSetting.findUnique({ where: { key: RECORD_KEY } }),
    prisma.appSetting.findUnique({ where: { key: REBATE_CONFIG_KEY } }),
  ]);

  const relMap = ((relRow?.valueJson as any) ?? {}) as Record<string, Rel>;
  const records = (Array.isArray(recordRow?.valueJson) ? (recordRow!.valueJson as any[]) : []) as RecordRow[];
  const rebateConfig = (rebateRow?.valueJson as any) ?? {};
  const rebateEnabled = !!rebateConfig.enabled;

  const now = Date.now();
  const from30 = now - 30 * 24 * 3600 * 1000;

  const invited30Set = new Set(
    Object.entries(relMap)
      .filter(([, r]) => {
        const t = new Date(r?.createdAt || "").getTime();
        return Number.isFinite(t) && t >= from30;
      })
      .map(([uid]) => uid)
  );

  const records30 = records.filter((r) => {
    const t = new Date(r.createdAt || "").getTime();
    return Number.isFinite(t) && t >= from30;
  });

  // 管理面板始终展示记录里已发生的返利金额，不受当前返利开关影响
  const totalRebate30Cents = records30.reduce((s, r) => s + Number(r.rebateAmountCents || 0), 0);

  const inviterAgg = new Map<string, number>();
  for (const r of records30) {
    const amount = Number(r.rebateAmountCents || 0);
    inviterAgg.set(r.inviterUserId, (inviterAgg.get(r.inviterUserId) || 0) + amount);
  }
  let topInviterUserId: string | null = null;
  let topAmount = 0;
  for (const [uid, v] of inviterAgg) {
    if (v > topAmount) {
      topAmount = v;
      topInviterUserId = uid;
    }
  }

  const ids = new Set<string>();
  records.forEach((r) => {
    if (r.inviterUserId) ids.add(r.inviterUserId);
    if (r.invitedUserId) ids.add(r.invitedUserId);
  });
  if (topInviterUserId) ids.add(topInviterUserId);

  const users = await prisma.user.findMany({ where: { id: { in: Array.from(ids) } }, select: { id: true, username: true } });
  const nameById = new Map(users.map((u) => [u.id, u.username] as const));

  const topInviter = topInviterUserId
    ? {
        userId: topInviterUserId,
        username: nameById.get(topInviterUserId) || "-",
        amountYuan: (topAmount / 100).toFixed(2),
      }
    : null;

  const rows = records
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 500)
    .map((r) => ({
      id: r.id,
      inviter: nameById.get(r.inviterUserId) || r.inviterUserId,
      invited: nameById.get(r.invitedUserId) || r.invitedUserId,
      level: r.level,
      rate: rebateEnabled ? r.rate : 0,
      orderAmountYuan: (Number(r.orderAmountCents || 0) / 100).toFixed(2),
      rebateAmountYuan: (Number(r.rebateAmountCents || 0) / 100).toFixed(2),
      createdAt: ymd(r.createdAt),
    }));

  return NextResponse.json({
    ok: true,
    summary: {
      invitedUsers30d: invited30Set.size,
      totalRebate30dYuan: (totalRebate30Cents / 100).toFixed(2),
      topInviter,
    },
    rows,
  });
}
