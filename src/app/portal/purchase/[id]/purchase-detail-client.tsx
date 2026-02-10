"use client";

import { useEffect, useMemo, useState } from "react";

type Cycle = { key: string; label: string; priceYuan: number | null; days: number; available: boolean };

type Data = {
  plan: { id: string; name: string; description: string | null };
  cycles: Cycle[];
};

export function PortalPurchaseDetailClient({ planId }: { planId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("YEARLY");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/plans/${planId}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData({ plan: json.plan, cycles: json.cycles || [] });
      const firstAvailable = (json.cycles || []).find((c: Cycle) => c.available);
      if (firstAvailable) setSelected(firstAvailable.key);
    } catch (e: any) {
      setError(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [planId]);

  const selectedCycle = useMemo(() => data?.cycles.find((c) => c.key === selected) ?? null, [data, selected]);

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-semibold">购买信息</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="border rounded-xl bg-white overflow-hidden">
        <div className="px-5 py-4 border-b">
          <div className="text-lg font-semibold">🛒 购买信息 · {data?.plan.name ?? ""}</div>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-sm text-red-500">* 选择支付周期</div>

          {(data?.cycles ?? [])
            .filter((c) => c.key === "TRIAL" || c.available)
            .map((c) => {
              const active = selected === c.key && c.available;
              const unavailable = !c.available;
              return (
                <button
                  key={c.key}
                  disabled={unavailable}
                  onClick={() => setSelected(c.key)}
                  className={
                    "w-full border rounded-xl p-4 text-left flex items-center justify-between " +
                    (active ? "border-blue-500 bg-blue-50" : unavailable ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50")
                  }
                >
                  <div>
                    <div className="text-2xl font-semibold">{c.label}{c.key === "TRIAL" ? `${c.days || 1}天` : ""} {unavailable ? <span className="ml-2 text-sm border px-2 py-0.5 rounded">不可用</span> : null}</div>
                    <div className="text-sm text-gray-500">服务期限：{c.days} 天</div>
                  </div>
                  <div className="text-4xl font-bold">¥{c.priceYuan ?? 0}</div>
                </button>
              );
            })}

          <div className="border rounded-xl p-4 bg-blue-50 text-gray-700">
            <div className="font-semibold text-xl mb-1">✅ 安全提示</div>
            <div>您的支付信息将通过 SSL 加密传输，我们不会存储您的支付密码。</div>
          </div>

          <button
            className="w-full bg-blue-600 text-white rounded-xl px-4 py-3 text-2xl font-semibold disabled:opacity-50"
            disabled={!selectedCycle || !selectedCycle.available}
            onClick={() => alert(`创建订单 ¥${selectedCycle?.priceYuan ?? 0}（下单流程下一步接入）`)}
          >
            创建订单 ¥{selectedCycle?.priceYuan ?? 0}
          </button>
        </div>
      </div>
    </div>
  );
}
