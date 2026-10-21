"use client";

import { OrderPaymentPanel, type PublicPaymentMethod, type OrderPaymentState } from "@/components/payments/order-payment-panel";

import { useEffect, useState } from "react";

type Data = {
  order: {
    id: string;
    status: "PENDING" | "PAID" | "CANCELED";
    payCycle: string;
    days: number;
    amountCents: number;
    createdAt: string;
    stripePayment?: OrderPaymentState; fulfillmentStatus?: string;
    plan: { id: string; name: string };
  };
  balanceYuan: number;
  paymentMethods?: PublicPaymentMethod[];
};

function fmtTime(v: string) {
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function PortalOrderDetailClient({ orderId }: { orderId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/orders/${orderId}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const amountYuan = (data?.order.amountCents ?? 0) / 100;

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-xl font-semibold">订单详情</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      {data ? (
        <>
          <div className="border rounded-xl bg-white overflow-hidden">
            <div className="px-5 py-4 border-b text-3xl font-semibold">🛒 订单详情</div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div><div className="text-gray-500">订单号</div><div className="font-mono mt-1">{data.order.id}</div></div>
              <div><div className="text-gray-500">订单状态</div><div className="mt-1">{data.order.status === "PENDING" ? "待支付" : data.order.status === "PAID" ? "已支付" : "已取消"}</div></div>
              <div><div className="text-gray-500">服务计划</div><div className="mt-1 text-2xl font-semibold">{data.order.plan.name}</div></div>
              <div><div className="text-gray-500">支付周期</div><div className="mt-1">{data.order.payCycle}</div></div>
              <div><div className="text-gray-500">服务时长</div><div className="mt-1 text-2xl font-semibold">{data.order.days} 天</div></div>
              <div><div className="text-gray-500">订单金额</div><div className="mt-1 text-3xl font-semibold text-[#e3001b]">¥{amountYuan.toFixed(2)}</div></div>
              <div><div className="text-gray-500">创建时间</div><div className="mt-1">{fmtTime(data.order.createdAt)}</div></div>
            </div>
          </div>

          <OrderPaymentPanel orderId={orderId} status={data.order.status} amountCents={data.order.amountCents} balanceYuan={data.balanceYuan} methods={data.paymentMethods} stripePayment={data.order.stripePayment} fulfillmentStatus={data.order.fulfillmentStatus} onChanged={refresh} />
        </>
      ) : null}
    </div>
  );
}
