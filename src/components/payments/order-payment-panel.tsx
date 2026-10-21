"use client";
import { useEffect, useRef, useState } from "react";
import { PAYMENT_SYNC_WARNING, paymentErrorText } from "@/lib/payment-messages";
export type PublicPaymentMethod = { id: string; name: string; description: string; mode: "test" | "live"; feePercent: number };
export type OrderPaymentState = { methodId: string; state: string; amountCents: number; feeCents: number } | null;
type Props = { orderId: string; status: string; amountCents: number; balanceYuan: number; methods?: PublicPaymentMethod[]; stripePayment?: OrderPaymentState; fulfillmentStatus?: string; onChanged: () => void | Promise<void> };
export function OrderPaymentPanel({ orderId, status, amountCents, balanceYuan, methods = [], stripePayment, fulfillmentStatus, onChanged }: Props) {
  const [selected, setSelected] = useState(stripePayment?.methodId ?? "balance");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = !!stripePayment && !["EXPIRED", "FAILED"].includes(stripePayment.state);
  const choice = active ? stripePayment.methodId : selected;
  const method = methods.find((m) => m.id === choice);
  const fee = active ? stripePayment.feeCents : method ? Math.ceil(amountCents * method.feePercent / 100) : 0;
  const blocked = active && ["CREATING", "PROCESSING", "REVIEW"].includes(stripePayment.state);
  const callback = useRef(onChanged);
  useEffect(() => { callback.current = onChanged; }, [onChanged]);
  useEffect(() => {
    if ((!active || stripePayment?.state === "REVIEW" || status !== "PENDING") && !(status === "PAID" && ["PENDING", "FAILED"].includes(fulfillmentStatus ?? ""))) return;
    const timer = window.setInterval(() => { void callback.current(); }, 5000);
    return () => window.clearInterval(timer);
  }, [active, stripePayment?.state, status, fulfillmentStatus]);
  async function pay() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const stripe = choice !== "balance";
      const response = await fetch(`/api/portal/orders/${orderId}/${stripe ? "checkout" : "pay"}`, {
        method: "POST", headers: { "content-type": "application/json" }, ...(stripe ? { body: JSON.stringify({ methodId: choice }) } : {}),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(paymentErrorText(json.error ?? "payment_failed"));
      if (stripe && json.url) { window.location.assign(json.url); return; }
      if (json.warn) setError(PAYMENT_SYNC_WARNING);
      await onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "支付暂时无法完成，请稍后重试"); await onChanged(); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/portal/orders/${orderId}/cancel`, { method: "POST" });
      const json = await response.json();
      if (!response.ok) throw new Error(paymentErrorText(json.error));
      await onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "取消失败，请稍后重试"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
    <h3 className="text-lg font-semibold">支付方式</h3>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-4 ${choice === "balance" ? "border-[#e3001b] bg-[#fff7f8]" : "border-gray-200"}`}><input type="radio" name={`payment-${orderId}`} value="balance" checked={choice === "balance"} disabled={active || busy || status !== "PENDING"} onChange={() => setSelected("balance")} className="accent-[#e3001b]" /><span className="min-w-0"><strong className="block text-sm">账户余额</strong><span className="block break-all text-sm text-gray-500">可用 ¥{balanceYuan.toFixed(2)}</span></span></label>
      {(amountCents > 0 ? methods : []).map((m) => <label key={m.id} className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-4 ${choice === m.id ? "border-[#e3001b] bg-[#fff7f8]" : "border-gray-200"}`}><input type="radio" name={`payment-${orderId}`} checked={choice === m.id} disabled={active || busy || status !== "PENDING"} onChange={() => setSelected(m.id)} className="accent-[#e3001b]" /><span className="min-w-0"><strong className="block break-words text-sm">{m.name}{m.mode === "test" ? " · 测试" : ""}</strong><span className="mt-1 block break-words text-xs leading-5 text-gray-500">{m.description || "前往 Stripe 安全收银台支付"}</span></span></label>)}
      {active && !method ? <div className="rounded-xl border border-[#e3001b] p-4 text-sm">Stripe · 该订单已有支付正在处理</div> : null}
    </div>
    {fee > 0 ? <p className="text-sm text-gray-500">服务金额 ¥{(amountCents / 100).toFixed(2)} + 手续费 ¥{(fee / 100).toFixed(2)} = ¥{((amountCents + fee) / 100).toFixed(2)}</p> : null}
    {active && status === "PENDING" ? <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">{stripePayment.state === "REVIEW" ? "该笔支付需要管理员核对，请勿重复付款。" : stripePayment.state === "PROCESSING" ? "Stripe 正在确认支付结果。支付完成后会自动更新，请勿重复付款。" : stripePayment.state === "CREATING" ? "正在初始化 Stripe 支付，系统会自动核对结果，请稍候。" : "已创建 Stripe 收银台。可继续支付，或取消订单后选择其他方式。"}</p> : null}
    {status === "PAID" ? <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{fulfillmentStatus === "DONE" || fulfillmentStatus === "NONE" ? "订单已支付，服务已开通。" : "支付已确认，正在同步开通服务，系统会自动重试，无需再次付款。"}</p> : null}
    {error ? <p role="alert" className="break-words text-sm leading-6 text-red-600">{error}</p> : null}
    <div className="flex flex-col gap-3 sm:flex-row">
      <button disabled={busy || status !== "PENDING" || blocked || (choice === "balance" && Math.round(balanceYuan * 100) < amountCents)} onClick={pay} className="flex-1 rounded-xl bg-[#e3001b] px-5 py-3 font-semibold text-white disabled:opacity-40">{busy ? "处理中..." : choice === "balance" ? `余额支付 ¥${(amountCents / 100).toFixed(2)}` : `前往 Stripe 支付 ¥${((amountCents + fee) / 100).toFixed(2)}`}</button>
      <button disabled={busy || status !== "PENDING" || blocked} onClick={cancel} className="rounded-xl border px-5 py-3 text-gray-600 disabled:opacity-40">取消订单</button>
    </div>
  </section>;
}
