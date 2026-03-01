"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = {
  id: string;
  status: "PENDING" | "PAID" | "CANCELED";
  payCycle: string;
  days: number;
  amountCents: number;
  createdAt: string;
  plan: { name: string };
};

function fmtTime(v: string) {
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function PortalOrdersClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/orders/list", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setRows(json?.rows ?? []);
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">订单记录</h1>
        <button className="border rounded px-3 py-2" onClick={refresh}>刷新</button>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="border rounded-lg overflow-auto bg-white">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="text-left text-gray-600 border-b">
            <tr>
              <th className="px-3 py-2">订单号</th>
              <th className="px-3 py-2">服务计划</th>
              <th className="px-3 py-2">周期</th>
              <th className="px-3 py-2">时长</th>
              <th className="px-3 py-2">金额</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">创建时间</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono">{r.id}</td>
                <td className="px-3 py-2">{r.plan?.name || "-"}</td>
                <td className="px-3 py-2">{r.payCycle}</td>
                <td className="px-3 py-2">{r.days} 天</td>
                <td className="px-3 py-2">¥{(r.amountCents / 100).toFixed(2)}</td>
                <td className="px-3 py-2">{r.status === "PENDING" ? "待支付" : r.status === "PAID" ? "已支付" : "已取消"}</td>
                <td className="px-3 py-2">{fmtTime(r.createdAt)}</td>
                <td className="px-3 py-2">
                  <Link className="text-[#e3001b] hover:underline" href={`/portal/orders/${r.id}`}>
                    查看
                  </Link>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-gray-500" colSpan={8}>暂无订单</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
