export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { autoCancelExpiredPendingOrders } from "@/lib/order-expiry";

function parseIntSafe(v: string | null, d: number) {
  if (v === null || v.trim() === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const daysRaw = parseIntSafe(url.searchParams.get("days"), 30);
  const days = [30, 90, 180, 365].includes(daysRaw) ? daysRaw : 30;
  const page = Math.max(1, parseIntSafe(url.searchParams.get("page"), 1));
  const pageSize = Math.max(1, Math.min(100, parseIntSafe(url.searchParams.get("pageSize"), 10)));
  const username = url.searchParams.get("username")?.trim();
  const status = url.searchParams.get("status")?.trim() ?? "";
  const planId = url.searchParams.get("planId")?.trim();
  if (status !== "" && status !== "PENDING" && status !== "PAID" && status !== "CANCELED") {
    return NextResponse.json({ error: "invalid_order_status" }, { status: 400 });
  }

  await autoCancelExpiredPendingOrders(prisma);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where = { createdAt: { gte: since } } as const;
  const listWhere: Prisma.ServiceOrderWhereInput = {
    ...where,
    ...(username ? { user: { username: { contains: username.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } } } : {}),
    ...(status ? { status } : {}),
    ...(planId ? { planId } : {}),
  };

  const [totalOrders, paidAgg, paidOrders, pendingOrders, rows, totalRows, plans] = await Promise.all([
    prisma.serviceOrder.count({ where }),
    prisma.serviceOrder.aggregate({ where: { ...where, status: "PAID" }, _sum: { amountCents: true } }),
    prisma.serviceOrder.count({ where: { ...where, status: "PAID" } }),
    prisma.serviceOrder.count({ where: { ...where, status: "PENDING" } }),
    prisma.serviceOrder.findMany({
      where: listWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        amountCents: true,
        status: true,
        fulfillmentStatus: true, paymentSource: true,
        stripePayment: { select: { state: true, sessionId: true, paymentIntentId: true, stripePaidAt: true, livemode: true, amountCents: true, feeCents: true, balanceCents: true } },
        createdAt: true,
        paidAt: true,
        user: { select: { username: true } },
        plan: { select: { name: true } },
      },
    }),
    prisma.serviceOrder.count({ where: listWhere }),
    prisma.plan.findMany({ select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
  ]);

  return NextResponse.json({
    ok: true,
    days,
    plans,
    summary: {
      totalOrders,
      totalIncomeYuan: ((paidAgg._sum.amountCents ?? 0) / 100).toFixed(2),
      paidOrders,
      pendingOrders,
    },
    pagination: {
      page,
      pageSize,
      total: totalRows,
      totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
    },
    rows: rows.map((r) => ({
      id: r.id,
      user: r.user?.username || "-",
      planName: r.plan?.name || "-",
      amountYuan: (r.amountCents / 100).toFixed(2),
      status: r.status,
      fulfillmentStatus: r.fulfillmentStatus, paymentSource: r.paymentSource,
      stripeState: r.stripePayment?.state ?? null, stripeSessionId: r.stripePayment?.sessionId ?? null,
      stripePaymentIntentId: r.stripePayment?.paymentIntentId ?? null,
      stripePaidAt: r.stripePayment?.stripePaidAt ?? null,
      stripeDashboardUrl: r.stripePayment?.paymentIntentId ? `https://dashboard.stripe.com/${r.stripePayment.livemode ? "" : "test/"}payments/${encodeURIComponent(r.stripePayment.paymentIntentId)}` : null,
      paidAmountYuan: r.status === "PAID" ? ((["STRIPE", "BALANCE_STRIPE"].includes(r.paymentSource ?? "") && r.stripePayment ? r.stripePayment.amountCents + r.stripePayment.balanceCents : r.amountCents) / 100).toFixed(2) : null,
      balanceOffsetYuan: ((r.stripePayment?.balanceCents ?? 0) / 100).toFixed(2),
      stripeAmountYuan: ((r.stripePayment?.amountCents ?? 0) / 100).toFixed(2),
      feeYuan: ((["STRIPE", "BALANCE_STRIPE"].includes(r.paymentSource ?? "") ? r.stripePayment?.feeCents ?? 0 : 0) / 100).toFixed(2),
      createdAt: r.createdAt,
      paidAt: r.paidAt,
    })),
  });
}
