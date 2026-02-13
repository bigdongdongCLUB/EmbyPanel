"use client";

import { useEffect, useState } from "react";

type Summary = {
  invitedUsers30d: number;
  totalRebate30dYuan: string;
  topInviter: null | { userId: string; username: string; amountYuan: string };
};

type Row = {
  id: string;
  inviter: string;
  invited: string;
  level: number;
  rate: number;
  orderAmountYuan: string;
  rebateAmountYuan: string;
  createdAt: string;
};

export function InvitesAdminClient() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/invites", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setSummary(json.summary);
      setRows(json.rows || []);
    } catch (e: any) {
      alert(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">邀请管理</h1>
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border rounded-lg bg-white p-4">
          <div className="text-sm text-gray-500">30日被邀请用户数</div>
          <div className="text-2xl font-semibold mt-1">{summary?.invitedUsers30d ?? 0}</div>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <div className="text-sm text-gray-500">30日总返利金额</div>
          <div className="text-2xl font-semibold mt-1">¥{summary?.totalRebate30dYuan ?? "0.00"}</div>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <div className="text-sm text-gray-500">TOP邀请人</div>
          <div className="text-2xl font-semibold mt-1">{summary?.topInviter?.username ?? "-"}</div>
          <div className="text-sm text-gray-500 mt-1">返利 ¥{summary?.topInviter?.amountYuan ?? "0.00"}</div>
        </div>
      </div>

      <div className="border rounded-lg bg-white overflow-auto">
        <div className="px-4 py-3 border-b font-medium">返利记录</div>
        <table className="min-w-[980px] w-full text-sm">
          <thead className="border-b text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">邀请人</th>
              <th className="px-3 py-2">被邀请人</th>
              <th className="px-3 py-2">层级</th>
              <th className="px-3 py-2">返利比例</th>
              <th className="px-3 py-2">订单金额</th>
              <th className="px-3 py-2">返利金额</th>
              <th className="px-3 py-2">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="px-3 py-2">{r.inviter}</td>
                <td className="px-3 py-2">{r.invited}</td>
                <td className="px-3 py-2">{r.level}</td>
                <td className="px-3 py-2">{r.rate}%</td>
                <td className="px-3 py-2">¥{r.orderAmountYuan}</td>
                <td className="px-3 py-2 text-green-700">¥{r.rebateAmountYuan}</td>
                <td className="px-3 py-2">{r.createdAt}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="px-3 py-6 text-gray-500" colSpan={7}>暂无返利记录</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
