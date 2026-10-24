"use client";

import { useEffect, useState } from "react";
import { PaginationBar } from "@/components/pagination-bar";
import { UiImage } from "@/components/ui-image";

type Row = {
  id: string;
  user: string;
  planName: string;
  amountYuan: string;
  status: "PENDING" | "PAID" | "CANCELED";
  createdAt: string;
  fulfillmentStatus?: string; paymentSource?: string | null; stripeState?: string | null; feeYuan?: string;
  stripePaymentIntentId?: string | null;
  stripeDashboardUrl?: string | null;
  stripePaidAt?: string | null;
  paidAt?: string | null;
  paidAmountYuan?: string | null;
};

type Resp = {
  ok: boolean;
  days: number;
  summary: {
    totalOrders: number;
    totalIncomeYuan: string;
    paidOrders: number;
    pendingOrders: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  rows: Row[];
};

function statusText(v: Row["status"]) {
  if (v === "PAID") return "已完成";
  if (v === "PENDING") return "待支付";
  return "已取消";
}

function formatDateTimeShanghai(v?: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function CopyId({ value, label }: { value: string; label: string }) {
  const [feedback, setFeedback] = useState<"ok" | "error" | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 2000);
    return () => clearTimeout(timer);
  }, [feedback]);
  return <button type="button" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-200 hover:bg-gray-50" title={feedback === "ok" ? "已复制" : feedback === "error" ? "复制失败" : label} aria-label={label} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setFeedback("ok"); } catch { setFeedback("error"); }
  }}>{feedback ? <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 ${feedback === "ok" ? "text-green-600" : "text-red-600"}`} fill="none" stroke="currentColor" strokeWidth="2"><path d={feedback === "ok" ? "M5 12l4 4L19 6" : "M6 6l12 12M18 6L6 18"} /></svg> : <UiImage src="/icons/copy.png" alt="" width={14} height={14} />}</button>;
}

export function OrdersAdminClient() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({ totalOrders: 0, totalIncomeYuan: "0.00", paidOrders: 0, pendingOrders: 0 });
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  async function refresh(nextDays = days, nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ days: String(nextDays), page: String(nextPage), pageSize: String(nextPageSize) });
      const res = await fetch(`/api/admin/orders?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null as Resp | null);
      if (!res.ok || !json) throw new Error(json ? JSON.stringify(json) : `HTTP ${res.status}`);
      setSummary(json.summary);
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setTotalPages(json.pagination?.totalPages || 1);
      setTotal(json.pagination?.total || 0);
      setPage(json.pagination?.page || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(30, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">订单管理</h1>
        <select
          className="border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none"
          value={String(days)}
          onChange={(e) => {
            const d = Number(e.target.value);
            setDays(d);
            refresh(d, 1);
          }}
        >
          <option value="30">30日</option>
          <option value="90">90日</option>
          <option value="180">180日</option>
          <option value="365">365日</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-gray-500">订单总览</div>
          <div className="text-2xl font-semibold mt-1 text-gray-900">{summary.totalOrders}</div>
        </div>
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-gray-500">总收入</div>
          <div className="text-2xl font-semibold mt-1 text-[#e3001b]">¥ {summary.totalIncomeYuan}</div>
        </div>
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-gray-500">完成订单</div>
          <div className="text-2xl font-semibold mt-1 text-green-700">{summary.paidOrders}</div>
        </div>
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-gray-500">待支付订单</div>
          <div className="text-2xl font-semibold mt-1 text-[#e3001b]">{summary.pendingOrders}</div>
        </div>
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}
      <p className="text-xs text-gray-500">时间统一为北京时间（Asia/Shanghai）。Stripe 对账请使用付款 ID（pi_），创建时间不等于付款时间。</p>

      <div className="bg-white border border-[#eaeaea] rounded-2xl overflow-auto shadow-sm">
        <table className="min-w-[1180px] w-full text-sm">
          <thead className="text-left text-[#666] border-b border-[#eaeaea] bg-[#f8f9fa]">
            <tr>
              <th className="py-2 px-3">订单ID</th>
              <th className="py-2 px-3">用户</th>
              <th className="py-2 px-3">订阅计划</th>
              <th className="py-2 px-3">实付金额</th>
              <th className="py-2 px-3">订单状态</th>
              <th className="py-2 px-3">付款</th>
              <th className="py-2 px-3">时间（北京时间）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[#eaeaea]">
                <td className="py-2 px-3"><div className="flex items-center gap-2"><span className="font-mono" title={r.id}>{r.id.slice(0, 8)}</span><CopyId value={r.id} label="复制完整面板订单 ID" /></div></td>
                <td className="py-2 px-3">{r.user}</td>
                <td className="py-2 px-3">{r.planName}</td>
                <td className="py-2 px-3 text-red-600 whitespace-nowrap">{r.status === "PAID" ? `¥${r.paidAmountYuan ?? r.amountYuan}` : <><span className="text-gray-500">未收款</span><div className="mt-1 text-xs text-gray-400">订单 ¥{r.amountYuan}</div></>}{r.status === "PAID" && Number(r.feeYuan) > 0 ? <div className="mt-1 text-xs text-gray-400">含手续费 ¥{r.feeYuan}</div> : null}</td>
                <td className="py-2 px-3"><div>{statusText(r.status)}{r.paymentSource === "STRIPE" ? " · Stripe" : ""}</div>{r.stripeState === "REVIEW" ? <div className="mt-1 text-xs text-red-600">收款需人工核对，请在 Stripe 后台检查</div> : null}{r.status === "PAID" && ["PENDING", "FAILED"].includes(r.fulfillmentStatus ?? "") ? <div className="mt-1 text-xs text-amber-600">服务待同步 · 自动重试中</div> : null}</td>
                <td className="py-2 px-3"><div className="w-[270px] space-y-2">
                  {r.stripePaymentIntentId ? <><div className="flex items-start gap-2"><span className="min-w-0 break-all font-mono text-xs">{r.stripePaymentIntentId}</span><CopyId value={r.stripePaymentIntentId} label="复制 Stripe 付款 ID" /></div>{r.stripeDashboardUrl ? <a href={r.stripeDashboardUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-[#e3001b] hover:underline">查看 Stripe 交易</a> : null}</> : <span className="text-xs text-gray-400">{r.paymentSource === "BALANCE" ? "余额付款" : r.paymentSource === "STRIPE" && r.status === "PAID" ? "付款 ID 待后台补齐" : "-"}</span>}
                </div></td>
                <td className="py-2 px-3 text-xs whitespace-nowrap"><div><span className="text-gray-400">创建：</span>{formatDateTimeShanghai(r.createdAt)}</div>{r.status === "PAID" ? <div className="mt-2"><span className="text-gray-400">付款确认：</span>{r.paymentSource === "STRIPE" ? (r.stripePaidAt ? formatDateTimeShanghai(r.stripePaidAt) : "待后台补齐") : formatDateTimeShanghai(r.paidAt)}</div> : null}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 px-3 text-center text-gray-500">暂无订单</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <PaginationBar
          total={total}
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={(p) => refresh(days, p, pageSize)}
          onPageSizeChange={(n) => { setPageSize(n); refresh(days, 1, n); }}
        />
      </div>
    </div>
  );
}
