"use client";

import { useEffect, useState } from "react";

type Data = {
  order: {
    id: string;
    status: "PENDING" | "PAID" | "CANCELED";
    payCycle: string;
    days: number;
    amountCents: number;
    createdAt: string;
    plan: { id: string; name: string };
  };
  balanceYuan: number;
};

function fmtTime(v: string) {
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function PortalOrderDetailClient({ orderId }: { orderId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/orders/${orderId}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e: any) {
      setError(e?.message || "load_failed");
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
          {paying ? (
            <div className="fixed inset-0 z-[320] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
              <div className="relative w-full max-w-sm rounded-2xl border border-[#f3d4d8] bg-white px-8 py-7 text-center shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-[#f3d4d8] border-t-[#e3001b]" />
                <div className="text-lg font-semibold text-[#222]">正在处理支付</div>
                <div className="mt-2 text-sm leading-6 text-[#666]">正在提交订单并同步服务器信息，请稍候，不要重复点击。</div>
              </div>
            </div>
          ) : null}
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

          <div className="border rounded-xl bg-white overflow-hidden">
            <div className="px-5 py-4 border-b text-3xl font-semibold">💳 支付方式</div>
            <div className="p-5">
              <div className="border-2 border-[#e3001b] bg-[#fff7f8] rounded-xl p-4 flex items-center justify-between">
                <div className="text-2xl font-semibold">账户余额</div>
                <div className="text-3xl font-semibold text-red-500">¥{data.balanceYuan.toFixed(2)}</div>
              </div>
            </div>
          </div>

          <div className="border rounded-xl bg-white p-5 space-y-3">
            <button
              className="w-full bg-[#e3001b] hover:bg-[#c20017] text-white rounded-xl px-4 py-3 text-2xl font-semibold disabled:opacity-50"
              disabled={paying || data.order.status !== "PENDING" || data.balanceYuan < amountYuan}
              onClick={async () => {
                if (paying) return;
                setPaying(true);
                try {
                  const res = await fetch(`/api/portal/orders/${orderId}/pay`, { method: "POST" });
                  const json = await res.json().catch(() => null);
                  if (!res.ok) {
                    alert(`支付失败: ${json?.error || `HTTP ${res.status}`}`);
                    return;
                  }
                  alert("支付成功");
                  await refresh();
                } finally {
                  setPaying(false);
                }
              }}
            >
              {paying ? "支付处理中…" : `立即支付（余额 ¥${amountYuan.toFixed(2)}）`}
            </button>

            <button
              className="w-full border border-red-400 text-red-500 rounded-xl px-4 py-3 text-2xl disabled:opacity-50"
              disabled={paying || data.order.status !== "PENDING"}
              onClick={async () => {
                const res = await fetch(`/api/portal/orders/${orderId}/cancel`, { method: "POST" });
                const json = await res.json().catch(() => null);
                if (!res.ok) {
                  alert(`取消失败: ${json?.error || `HTTP ${res.status}`}`);
                  return;
                }
                alert("订单已取消");
                await refresh();
              }}
            >
              取消订单
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
