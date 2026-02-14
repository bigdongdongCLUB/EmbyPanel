"use client";

import { useEffect, useMemo, useState } from "react";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  prices: {
    trialYuan: number | null;
    trialDays: number | null;
    monthlyYuan: number | null;
    quarterlyYuan: number | null;
    halfYearlyYuan: number | null;
    yearlyYuan: number | null;
    twoYearlyYuan: number | null;
  };
};

type Cycle = { key: string; label: string; priceYuan: number | null; days: number; available: boolean };

type PlanDetail = {
  plan: { id: string; name: string; description: string | null };
  cycles: Cycle[];
};

type OrderDetail = {
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

function pickMainPrice(p: Plan) {
  if (p.prices.yearlyYuan !== null) return { price: p.prices.yearlyYuan, cycle: "年付" };
  if (p.prices.monthlyYuan !== null) return { price: p.prices.monthlyYuan, cycle: "月付" };
  if (p.prices.quarterlyYuan !== null) return { price: p.prices.quarterlyYuan, cycle: "季付" };
  if (p.prices.halfYearlyYuan !== null) return { price: p.prices.halfYearlyYuan, cycle: "半年付" };
  if (p.prices.twoYearlyYuan !== null) return { price: p.prices.twoYearlyYuan, cycle: "两年付" };
  return { price: 0, cycle: "起" };
}

function fmtTime(v: string) {
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function cycleLabel(v: string) {
  const map: Record<string, string> = {
    TRIAL: "试用",
    MONTHLY: "月付",
    QUARTERLY: "季付",
    HALF_YEARLY: "半年付",
    YEARLY: "年付",
    TWO_YEARLY: "两年付",
  };
  return map[v] || v;
}

export function PortalPurchaseClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<"plan" | "order">("plan");

  const [planDetail, setPlanDetail] = useState<PlanDetail | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<string>("YEARLY");
  const [planLoading, setPlanLoading] = useState(false);

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

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

  async function openPlanModal(planId: string) {
    setModalOpen(true);
    setStep("plan");
    setPlanDetail(null);
    setOrder(null);
    setPlanLoading(true);
    try {
      const res = await fetch(`/api/portal/plans/${planId}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setPlanDetail({ plan: json.plan, cycles: json.cycles || [] });
      const firstAvailable = (json.cycles || []).find((c: Cycle) => c.available);
      if (firstAvailable) setSelectedCycle(firstAvailable.key);
    } catch (e: any) {
      alert(`加载购买信息失败: ${e?.message || "unknown"}`);
      setModalOpen(false);
    } finally {
      setPlanLoading(false);
    }
  }

  async function loadOrder(orderId: string) {
    setOrderLoading(true);
    try {
      const res = await fetch(`/api/portal/orders/${orderId}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setOrder(json);
    } catch (e: any) {
      alert(`加载订单失败: ${e?.message || "unknown"}`);
    } finally {
      setOrderLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const currentCycle = useMemo(
    () => planDetail?.cycles.find((c) => c.key === selectedCycle) ?? null,
    [planDetail, selectedCycle],
  );

  const orderAmountYuan = (order?.order.amountCents ?? 0) / 100;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">购买服务</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="text-center py-2.5">
        <div className="text-[28px] font-semibold">选择适合你的服务计划</div>
        <div className="text-sm text-gray-500 mt-1">选择计划后，您可以查看详细的服务列表和支付方式。</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((p) => {
          const main = pickMainPrice(p);
          return (
            <div key={p.id} className="border rounded-xl p-3 space-y-2.5 bg-white shadow-sm max-w-[320px]">
              <div className="flex items-start justify-between gap-2">
                <div className="text-2xl font-semibold leading-tight">{p.name}</div>
                {p.prices.trialYuan !== null ? <div className="text-xs shrink-0 pt-0.5 inline-flex items-center rounded border border-green-200 bg-green-50 px-2 py-0.5 text-green-600">可试用</div> : null}
              </div>

              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold">¥{main.price}</span>
                <span className="text-sm text-gray-500 pb-0.5">/{main.cycle}</span>
              </div>

              <div className="text-sm text-gray-500">起，更多周期可选</div>
              {p.description ? <div className="text-sm text-gray-600 whitespace-pre-wrap">{p.description}</div> : null}

              <button className="w-full text-center bg-blue-600 text-white rounded px-2.5 py-2 text-sm" onClick={() => openPlanModal(p.id)}>
                🛒 立即购买
              </button>
            </div>
          );
        })}
      </div>

      {!loading && plans.length === 0 ? <div className="text-sm text-gray-500">暂无可用订阅计划</div> : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-auto rounded-lg bg-white p-4 space-y-4">
            {step === "plan" ? (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">购买信息</h2>

                {planLoading ? <div className="text-sm text-gray-500">加载中…</div> : null}

                <div className="border rounded-xl bg-white overflow-hidden">
                  <div className="px-5 py-4 border-b text-lg font-semibold">🛒 购买信息 · {planDetail?.plan.name ?? ""}</div>
                  <div className="p-5 space-y-4">
                    <div className="text-sm text-red-500">* 选择支付周期</div>

                    {(planDetail?.cycles ?? [])
                      .filter((c) => c.key === "TRIAL" || c.available)
                      .map((c) => {
                        const active = selectedCycle === c.key && c.available;
                        const unavailable = !c.available;
                        return (
                          <button
                            key={c.key}
                            disabled={unavailable}
                            onClick={() => setSelectedCycle(c.key)}
                            className={
                              "w-full border rounded-xl p-4 text-left flex items-center justify-between " +
                              (active ? "border-blue-500 bg-blue-50" : unavailable ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50")
                            }
                          >
                            <div>
                              <div className="text-2xl font-semibold">
                                {c.label}
                                {c.key === "TRIAL" ? `${c.days || 1}天` : ""}
                                {unavailable ? <span className="ml-2 text-sm border px-2 py-0.5 rounded">不可用</span> : null}
                              </div>
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
                      className="w-full bg-gray-700 text-white rounded-xl px-4 py-3 text-2xl font-semibold disabled:opacity-50"
                      disabled={!currentCycle || !currentCycle.available}
                      onClick={async () => {
                        const res = await fetch("/api/portal/orders", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            planId: planDetail?.plan.id,
                            payCycle: currentCycle?.key,
                            days: currentCycle?.days,
                            amountYuan: currentCycle?.priceYuan ?? 0,
                          }),
                        });
                        const json = await res.json().catch(() => null);
                        if (!res.ok) {
                          alert(`创建订单失败: ${json?.error || `HTTP ${res.status}`}`);
                          return;
                        }
                        setStep("order");
                        await loadOrder(json.orderId);
                      }}
                    >
                      创建订单 ¥{currentCycle?.priceYuan ?? 0}
                    </button>

                    <button className="w-full border bg-white rounded-xl px-4 py-3 text-xl" onClick={() => setModalOpen(false)}>
                      取消
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">订单详情</h2>
                {orderLoading ? <div className="text-sm text-gray-500">加载中…</div> : null}

                {order ? (
                  <>
                    <div className="border rounded-xl bg-white overflow-hidden">
                      <div className="px-5 py-4 border-b text-3xl font-semibold">🛒 订单详情</div>
                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                        <div><div className="text-gray-500">订单号</div><div className="font-mono mt-1">{order.order.id}</div></div>
                        <div><div className="text-gray-500">订单状态</div><div className="mt-1">{order.order.status === "PENDING" ? "待支付" : order.order.status === "PAID" ? "已支付" : "已取消"}</div></div>
                        <div><div className="text-gray-500">服务计划</div><div className="mt-1 text-2xl font-semibold">{order.order.plan.name}</div></div>
                        <div><div className="text-gray-500">支付周期</div><div className="mt-1">{cycleLabel(order.order.payCycle)}</div></div>
                        <div><div className="text-gray-500">服务时长</div><div className="mt-1 text-2xl font-semibold">{order.order.days} 天</div></div>
                        <div><div className="text-gray-500">订单金额</div><div className="mt-1 text-3xl font-semibold text-blue-600">¥{orderAmountYuan.toFixed(2)}</div></div>
                        <div><div className="text-gray-500">创建时间</div><div className="mt-1">{fmtTime(order.order.createdAt)}</div></div>
                      </div>
                    </div>

                    <div className="border rounded-xl bg-white overflow-hidden">
                      <div className="px-5 py-4 border-b text-3xl font-semibold">💳 支付方式</div>
                      <div className="p-5">
                        <div className="border-2 border-blue-500 rounded-xl p-4 flex items-center justify-between">
                          <div className="text-2xl font-semibold">余额支付</div>
                          <div className="text-3xl font-semibold text-red-500">¥{order.balanceYuan.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-xl bg-white p-5 space-y-3">
                      <button
                        className="w-full bg-gray-700 text-white rounded-xl px-4 py-3 text-2xl font-semibold disabled:opacity-50"
                        disabled={order.order.status !== "PENDING" || order.balanceYuan < orderAmountYuan}
                        onClick={async () => {
                          const res = await fetch(`/api/portal/orders/${order.order.id}/pay`, { method: "POST" });
                          const json = await res.json().catch(() => null);
                          if (!res.ok) {
                            alert(`支付失败: ${json?.error || `HTTP ${res.status}`}`);
                            return;
                          }
                          alert("支付成功");
                          window.location.href = "/portal";
                        }}
                      >
                        立即支付（余额 ¥{orderAmountYuan.toFixed(2)}）
                      </button>

                      <button
                        className="w-full border border-red-400 text-red-500 rounded-xl px-4 py-3 text-2xl"
                        disabled={order.order.status !== "PENDING"}
                        onClick={async () => {
                          const res = await fetch(`/api/portal/orders/${order.order.id}/cancel`, { method: "POST" });
                          const json = await res.json().catch(() => null);
                          if (!res.ok) {
                            alert(`取消失败: ${json?.error || `HTTP ${res.status}`}`);
                            return;
                          }
                          setModalOpen(false);
                        }}
                      >
                        取消订单
                      </button>

                      <button className="w-full border rounded-xl px-4 py-3 text-xl" onClick={() => setModalOpen(false)}>
                        取消
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
