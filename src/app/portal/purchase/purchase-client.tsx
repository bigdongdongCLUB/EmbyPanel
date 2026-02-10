"use client";

import { useEffect, useState } from "react";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  prices: {
    monthlyYuan: number | null;
    quarterlyYuan: number | null;
    halfYearlyYuan: number | null;
    yearlyYuan: number | null;
    twoYearlyYuan: number | null;
  };
};

function pickMainPrice(p: Plan) {
  if (p.prices.yearlyYuan !== null) return { price: p.prices.yearlyYuan, cycle: "年付" };
  if (p.prices.monthlyYuan !== null) return { price: p.prices.monthlyYuan, cycle: "月付" };
  if (p.prices.quarterlyYuan !== null) return { price: p.prices.quarterlyYuan, cycle: "季付" };
  if (p.prices.halfYearlyYuan !== null) return { price: p.prices.halfYearlyYuan, cycle: "半年付" };
  if (p.prices.twoYearlyYuan !== null) return { price: p.prices.twoYearlyYuan, cycle: "两年付" };
  return { price: 0, cycle: "起" };
}

export function PortalPurchaseClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/plans", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setPlans(json?.plans ?? []);
    } catch (e: any) {
      setError(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">购买服务</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="text-center py-3">
        <div className="text-4xl font-semibold">选择适合你的服务计划</div>
        <div className="text-sm text-gray-500 mt-2">选择计划后，您可以查看详细的服务列表和支付方式。</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {plans.map((p) => {
          const main = pickMainPrice(p);
          return (
            <div key={p.id} className="border rounded-xl p-4 space-y-3 bg-white shadow-sm max-w-[360px]">
              <div className="text-3xl font-semibold">{p.name}</div>

              <div className="flex items-end gap-2">
                <span className="text-5xl font-bold">¥{main.price}</span>
                <span className="text-sm text-gray-500 pb-1">/{main.cycle}</span>
              </div>

              <div className="text-sm text-gray-500">起，更多周期可选</div>
              {p.description ? <div className="text-sm text-gray-600 whitespace-pre-wrap">{p.description}</div> : null}

              <a className="block w-full text-center bg-blue-600 text-white rounded px-3 py-2" href={`/portal/purchase/${p.id}`}>
                🛒 立即购买
              </a>
            </div>
          );
        })}
      </div>

      {!loading && plans.length === 0 ? <div className="text-sm text-gray-500">暂无可用订阅计划</div> : null}
    </div>
  );
}
