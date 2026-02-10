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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">购买服务</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map((p) => (
          <div key={p.id} className="border rounded-xl p-4 space-y-3 bg-white">
            <div className="text-2xl font-semibold">{p.name}</div>
            {p.description ? <div className="text-sm text-gray-600 whitespace-pre-wrap">{p.description}</div> : null}

            <div className="text-sm text-gray-700 space-y-1">
              {p.prices.monthlyYuan !== null ? <div>月付：¥{p.prices.monthlyYuan}</div> : null}
              {p.prices.quarterlyYuan !== null ? <div>季付：¥{p.prices.quarterlyYuan}</div> : null}
              {p.prices.halfYearlyYuan !== null ? <div>半年付：¥{p.prices.halfYearlyYuan}</div> : null}
              {p.prices.yearlyYuan !== null ? <div>年付：¥{p.prices.yearlyYuan}</div> : null}
              {p.prices.twoYearlyYuan !== null ? <div>两年付：¥{p.prices.twoYearlyYuan}</div> : null}
            </div>

            <button
              className="w-full bg-blue-600 text-white rounded px-3 py-2"
              onClick={() => alert(`立即购买：${p.name}（下单流程下一步接入）`)}
            >
              立即购买
            </button>
          </div>
        ))}
      </div>

      {!loading && plans.length === 0 ? <div className="text-sm text-gray-500">暂无可用订阅计划</div> : null}
    </div>
  );
}
