"use client";

import { useEffect, useState } from "react";
import { PaginationBar } from "@/components/pagination-bar";

type Row = {
  id: string;
  user: string;
  planName: string;
  amountYuan: string;
  status: "PENDING" | "PAID" | "CANCELED";
  createdAt: string;
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

function formatDateTimeShanghai(v?: string) {
  if (!v) return "-";
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
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
      const json: Resp = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error((json as any)?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
      setSummary(json.summary);
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setTotalPages(json.pagination?.totalPages || 1);
      setTotal(json.pagination?.total || 0);
      setPage(json.pagination?.page || 1);
    } catch (e: any) {
      setError(e?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(30, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">订单管理</h1>
        <select
          className="border rounded px-3 py-2"
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="text-sm text-gray-500">订单总览</div>
          <div className="text-2xl font-semibold mt-1 text-gray-900">{summary.totalOrders}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="text-sm text-gray-500">总收入</div>
          <div className="text-2xl font-semibold mt-1 text-red-600">¥ {summary.totalIncomeYuan}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="text-sm text-gray-500">完成订单</div>
          <div className="text-2xl font-semibold mt-1 text-green-700">{summary.paidOrders}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="text-sm text-gray-500">待支付订单</div>
          <div className="text-2xl font-semibold mt-1 text-[#e3001b]">{summary.pendingOrders}</div>
        </div>
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="border rounded-lg overflow-auto bg-white">
        <table className="min-w-[920px] w-full text-sm">
          <thead className="text-left text-gray-600 border-b bg-gray-50">
            <tr>
              <th className="py-2 px-3">订单ID</th>
              <th className="py-2 px-3">用户</th>
              <th className="py-2 px-3">订阅计划</th>
              <th className="py-2 px-3">实付金额</th>
              <th className="py-2 px-3">订单状态</th>
              <th className="py-2 px-3">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2 px-3 font-mono">{r.id.slice(0, 8)}</td>
                <td className="py-2 px-3">{r.user}</td>
                <td className="py-2 px-3">{r.planName}</td>
                <td className="py-2 px-3 text-red-600">¥{r.amountYuan}</td>
                <td className="py-2 px-3">{statusText(r.status)}</td>
                <td className="py-2 px-3 font-mono text-xs">{formatDateTimeShanghai(r.createdAt)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 px-3 text-center text-gray-500">暂无订单</td>
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
