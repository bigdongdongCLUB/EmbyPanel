"use client";

import { useEffect, useMemo, useState } from "react";
import { ToggleSwitch } from "../../settings/toggle-switch";
import { PaginationBar } from "@/components/pagination-bar";

type PenaltyConfig = { enabled: boolean; durationMinutes: number };
type PenaltyRecord = {
  id: string;
  username: string;
  serverName: string;
  disabledAt: string;
  unlockAt: string;
  status: string;
};

function formatDateTimeShanghai(v?: string) {
  if (!v) return "-";
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function MonitoringPenaltiesClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [penaltyEnabled, setPenaltyEnabled] = useState(true);
  const [penaltyDuration, setPenaltyDuration] = useState(5);
  const [savingPenalty, setSavingPenalty] = useState(false);
  const [rows, setRows] = useState<PenaltyRecord[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/monitoring/anomalies?page=1&pageSize=10", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
      const cfg: PenaltyConfig = json?.penaltyConfig || { enabled: true, durationMinutes: 5 };
      setPenaltyEnabled(!!cfg.enabled);
      setPenaltyDuration(Number(cfg.durationMinutes || 5));
      setRows(Array.isArray(json?.penaltyRecords) ? json.penaltyRecords : []);
      setPage(1);
    } catch (e: any) {
      setError(e?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }

  async function savePenaltyConfig() {
    setSavingPenalty(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings/anomaly-penalty", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: penaltyEnabled, durationMinutes: Number(penaltyDuration) || 5 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "save_penalty_failed");
    } finally {
      setSavingPenalty(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filteredRows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => String(r.username || "").toLowerCase().includes(qq));
  }, [rows, q]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total/ pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = useMemo(() => filteredRows.slice((safePage - 1) * pageSize, (safePage - 1) * pageSize + pageSize), [filteredRows, safePage, pageSize]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="border rounded px-3 py-2 min-w-[220px]"
          placeholder="搜索用户名"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />

        <label className="flex items-center gap-2 text-sm text-gray-700">
          启用处罚
          <ToggleSwitch checked={penaltyEnabled} onChange={setPenaltyEnabled} textOn="已启用" textOff="已禁用" />
        </label>

        <select className="border rounded px-3 py-2" value={String(penaltyDuration)} onChange={(e) => setPenaltyDuration(Number(e.target.value))}>
          <option value="5">5 分钟</option>
          <option value="10">10 分钟</option>
          <option value="15">15 分钟</option>
          <option value="30">30 分钟</option>
        </select>


        <button className="border rounded px-3 py-2" onClick={savePenaltyConfig} disabled={savingPenalty}>
          {savingPenalty ? "保存中..." : "保存处罚设置"}
        </button>

        <button className="border rounded px-3 py-2" onClick={refresh} disabled={loading}>
          刷新
        </button>

        {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}

      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium text-sm">处罚记录</div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500">最多显示最近 1000 条</div>
          </div>
        </div>

        <div className="mt-3 overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="text-left text-gray-600 border-b">
              <tr>
                <th className="py-2 px-3">用户</th>
                <th className="py-2 px-3">服务器</th>
                <th className="py-2 px-3">处罚开始</th>
                <th className="py-2 px-3">处罚结束</th>
                <th className="py-2 px-3">解禁状态</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const statusText = r.status === "UNBANNED" ? "已解禁" : r.status === "PENDING" ? "封禁中" : r.status === "SKIPPED_NOT_ELIGIBLE" ? "到期跳过" : r.status === "FAILED_UNBAN" ? "解禁失败" : r.status === "FAILED_DISABLE" ? "封禁失败" : r.status;
                return (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="py-2 px-3">{r.username || "-"}</td>
                    <td className="py-2 px-3">{r.serverName || "-"}</td>
                    <td className="py-2 px-3 text-xs text-gray-700">{formatDateTimeShanghai(r.disabledAt)}</td>
                    <td className="py-2 px-3 text-xs text-gray-700">{formatDateTimeShanghai(r.unlockAt)}</td>
                    <td className="py-2 px-3">{statusText}</td>
                  </tr>
                );
              })}
              {!loading && total === 0 ? (
                <tr>
                  <td className="py-6 px-3 text-gray-500" colSpan={5}>暂无处罚记录</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3">
          <PaginationBar
            total={total}
            page={safePage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={(p) => setPage(Math.min(Math.max(1, p), totalPages))}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>
    </div>
  );
}
