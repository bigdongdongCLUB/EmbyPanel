"use client";

import { UiImage } from "@/components/ui-image";
import { useEffect, useMemo, useState } from "react";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  prices: {
    trialYuan: number | null;
    trialHours: number | null;
    monthlyYuan: number | null;
    quarterlyYuan: number | null;
    halfYearlyYuan: number | null;
    yearlyYuan: number | null;
    twoYearlyYuan: number | null;
  };
};

type Cycle = { key: string; label: string; priceYuan: number | null; days: number; hours?: number; available: boolean };

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
    trialHours?: number | null;
    amountCents: number;
    createdAt: string;
    plan: { id: string; name: string };
  };
  balanceYuan: number;
};

function pickMainPrice(p: Plan) {
  const paidCycles: Array<{ cycle: string; price: number }> = [
    { cycle: "月付", price: p.prices.monthlyYuan ?? NaN },
    { cycle: "季付", price: p.prices.quarterlyYuan ?? NaN },
    { cycle: "半年付", price: p.prices.halfYearlyYuan ?? NaN },
    { cycle: "年付", price: p.prices.yearlyYuan ?? NaN },
    { cycle: "两年付", price: p.prices.twoYearlyYuan ?? NaN },
  ].filter((x) => Number.isFinite(x.price));

  if (paidCycles.length > 0) {
    const min = paidCycles.reduce((a, b) => (b.price < a.price ? b : a));
    return {
      price: min.price,
      cycle: min.cycle,
      hasMore: paidCycles.length > 1,
    };
  }

  if (p.prices.trialYuan !== null) return { price: p.prices.trialYuan, cycle: "试用", hasMore: false };
  return { price: 0, cycle: "起", hasMore: false };
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

      <div className="text-center py-3 mb-1">
        <div className="text-[28px] font-semibold text-[#222]">选择适合你的服务计划</div>
        <div className="text-sm text-[#888] mt-1.5">选择计划后，您可以查看详细的服务列表和支付方式。</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-[1000px] mx-auto">
        {plans.map((p) => {
          const main = pickMainPrice(p);
          const highlight = p.prices.trialYuan !== null;
          return (
            <div
              key={p.id}
              className="relative rounded-xl p-7 flex flex-col transition-all bg-white border-2 border-[#e3001b] shadow-[0_8px_24px_rgba(227,0,27,0.08)] hover:shadow-[0_12px_32px_rgba(227,0,27,0.14)] hover:-translate-y-0.5"
            >
              {highlight ? <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#e3001b] text-white text-xs px-3 py-1 rounded-full">可试用</div> : null}

              <div className="text-[22px] font-bold text-[#222] leading-tight mb-4">{p.name}</div>

              <div className="mb-7 flex items-end gap-1.5 flex-wrap">
                <span className="text-[#e3001b] text-2xl font-bold leading-none">¥</span>
                <span className="text-[#e3001b] text-[40px] font-bold leading-none">{main.price}</span>
                <span className="text-[13px] text-[#888] pb-0.5">/{main.cycle}{main.hasMore ? "起，更多周期可选" : ""}</span>
              </div>

              {p.description ? <div className="text-sm text-[#666] whitespace-pre-wrap mb-4">{p.description}</div> : null}

              <button
                className="mt-auto w-full bg-[#e3001b] hover:bg-[#c20017] text-white rounded-lg px-3 py-3 text-[15px] font-bold inline-flex items-center justify-center gap-2"
                onClick={() => openPlanModal(p.id)}
              >
                <UiImage src="/icons/shopping.svg" alt="" className="h-4 w-4 invert" />
                <span>立即购买</span>
              </button>
            </div>
          );
        })}
      </div>

      {!loading && plans.length === 0 ? <div className="text-sm text-gray-500">暂无可用订阅计划</div> : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[88vh] overflow-auto rounded-2xl bg-white p-5 space-y-4">
            {step === "plan" ? (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">购买信息</h2>

                {planLoading ? <div className="text-sm text-gray-500">加载中…</div> : null}

                <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 text-xl font-semibold text-[#222]">🛒 购买信息 · {planDetail?.plan.name ?? ""}</div>
                  <div className="p-6 space-y-4">
                    <div className="text-sm text-[#e3001b]">* 选择支付周期</div>

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
                              (active ? "border-[#e3001b] bg-[#fff5f6]" : unavailable ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50")
                            }
                          >
                            <div>
                              <div className="text-2xl font-semibold">
                                {c.label}
                                {c.key === "TRIAL" ? `${c.hours || 1}小时` : ""}
                                {unavailable ? <span className="ml-2 text-sm border px-2 py-0.5 rounded">不可用</span> : null}
                              </div>
                              <div className="text-sm text-gray-500">服务期限：{c.key === "TRIAL" ? `${c.hours || 1} 小时` : `${c.days} 天`}</div>
                            </div>
                            <div className="text-4xl font-bold">¥{c.priceYuan ?? 0}</div>
                          </button>
                        );
                      })}

                    <div className="border border-[#f3d4d8] rounded-xl p-4 bg-[#fff7f8] text-[#444]">
                      <div className="font-semibold text-lg mb-1">✅ 安全提示</div>
                      <div>您的支付信息将通过 SSL 加密传输，我们不会存储您的支付密码。</div>
                    </div>

                    <button
                      className="w-full bg-[#e3001b] hover:bg-[#c20017] text-white rounded-xl px-4 py-3 text-xl font-semibold disabled:opacity-50"
                      disabled={!currentCycle || !currentCycle.available}
                      onClick={async () => {
                        const res = await fetch("/api/portal/orders", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            planId: planDetail?.plan.id,
                            payCycle: currentCycle?.key,
                            days: currentCycle?.days,
                            trialHours: currentCycle?.key === "TRIAL" ? currentCycle?.hours : undefined,
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

                    <button className="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-base hover:bg-gray-50" onClick={() => setModalOpen(false)}>
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
                    <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-200 text-2xl font-semibold text-[#222]">🛒 订单详情</div>
                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                        <div><div className="text-gray-500">订单号</div><div className="font-mono mt-1">{order.order.id}</div></div>
                        <div><div className="text-gray-500">订单状态</div><div className="mt-1">{order.order.status === "PENDING" ? "待支付" : order.order.status === "PAID" ? "已支付" : "已取消"}</div></div>
                        <div><div className="text-gray-500">服务计划</div><div className="mt-1 text-2xl font-semibold">{order.order.plan.name}</div></div>
                        <div><div className="text-gray-500">支付周期</div><div className="mt-1">{cycleLabel(order.order.payCycle)}</div></div>
                        <div><div className="text-gray-500">服务时长</div><div className="mt-1 text-2xl font-semibold">{order.order.payCycle === "TRIAL" ? `${order.order.trialHours || (order.order.days * 24)} 小时` : `${order.order.days} 天`}</div></div>
                        <div><div className="text-gray-500">订单金额</div><div className="mt-1 text-3xl font-semibold text-[#e3001b]">¥{orderAmountYuan.toFixed(2)}</div></div>
                        <div><div className="text-gray-500">创建时间</div><div className="mt-1">{fmtTime(order.order.createdAt)}</div></div>
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-200 text-2xl font-semibold text-[#222]">💳 支付方式</div>
                      <div className="p-5">
                        <div className="border-2 border-[#e3001b] rounded-xl p-4 flex items-center justify-between bg-[#fff7f8]">
                          <div className="text-xl font-semibold">账户余额</div>
                          <div className="text-3xl font-semibold text-[#e3001b]">¥{order.balanceYuan.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded-2xl bg-white p-5 space-y-3">
                      <button
                        className="w-full bg-[#e3001b] hover:bg-[#c20017] text-white rounded-xl px-4 py-3 text-xl font-semibold disabled:opacity-50"
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
                        className="w-full border border-red-300 text-red-600 rounded-xl px-4 py-3 text-lg hover:bg-red-50"
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
