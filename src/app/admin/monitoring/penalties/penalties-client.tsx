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
  lastError?: string;
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
  const [unbanningId, setUnbanningId] = useState<string | null>(null);

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

  async function manualUnban(recordId: string) {
    setUnbanningId(recordId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/monitoring/penalties/${encodeURIComponent(recordId)}/unban`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "manual_unban_failed");
    } finally {
      setUnbanningId(null);
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
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-center bg-white border border-[#eaeaea] rounded-xl p-2 shadow-sm">
        <input
          className="border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 min-w-[220px] focus:border-[#e3001b] outline-none"
          placeholder="搜索用户名"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />

        <div className="relative flex items-center gap-2 text-sm text-gray-700">
          <span>启用处罚</span>
          <span className="relative inline-flex items-center group">
            <button
              type="button"
              className="p-0 m-0 border-0 bg-transparent leading-none cursor-help"
              aria-label="处罚说明"
              title="处罚说明"
            >
              <img src="/icons/exclamation.svg" alt="处罚说明" className="w-4 h-4" />
            </button>
            <div className="hidden group-hover:block group-focus-within:block absolute left-0 top-[calc(100%+8px)] z-30 w-[360px] rounded-xl border border-[#f1d3d8] bg-white shadow-lg p-3">
              <div className="text-[13px] text-[#2d2d2d] leading-6">
                可对连续触发异常播放的用户实行封禁处罚，且处罚一周内叠加，最多默认处罚时间*4。
              </div>
            </div>
          </span>
          <ToggleSwitch checked={penaltyEnabled} onChange={setPenaltyEnabled} textOn="已启用" textOff="已禁用" />
        </div>

        <select className="border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={String(penaltyDuration)} onChange={(e) => setPenaltyDuration(Number(e.target.value))}>
          <option value="5">5 分钟</option>
          <option value="10">10 分钟</option>
          <option value="15">15 分钟</option>
          <option value="30">30 分钟</option>
        </select>


        <button className="border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" onClick={savePenaltyConfig} disabled={savingPenalty}>
          {savingPenalty ? "保存中..." : "保存处罚设置"}
        </button>

        <button className="border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" onClick={refresh} disabled={loading}>
          刷新
        </button>

        {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}

      <div className="bg-white border border-[#eaeaea] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium text-sm">处罚记录</div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500">最多显示最近 1000 条</div>
          </div>
        </div>

        <div className="mt-3 overflow-auto">
          <table className="min-w-[900px] w-full text-[14px]">
            <thead className="text-left text-[#666] text-[13px] border-y border-[#eaeaea] bg-[#f8f9fa]">
              <tr>
                <th className="py-4 px-3 font-medium">用户</th>
                <th className="py-4 px-3 font-medium">服务器</th>
                <th className="py-4 px-3 font-medium">处罚开始</th>
                <th className="py-4 px-3 font-medium">处罚结束</th>
                <th className="py-4 px-3 font-medium">解禁状态</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const isPending = r.status === "PENDING";
                const isRetryableFailedUnban = r.status === "FAILED_UNBAN";
                const canManualUnban = isPending || isRetryableFailedUnban;
                const statusText =
                  r.status === "UNBANNED"
                    ? "已解禁"
                    : r.status === "UNBANNED_MANUAL"
                    ? "已解禁（手动）"
                    : r.status === "PENDING"
                    ? "封禁中"
                    : r.status === "SKIPPED_NOT_ELIGIBLE"
                    ? "到期跳过"
                    : r.status === "FAILED_UNBAN"
                    ? "解禁失败"
                    : r.status === "FAILED_DISABLE"
                    ? "封禁失败"
                    : r.status;
                return (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="py-4 px-3 leading-6">{r.username || "-"}</td>
                    <td className="py-4 px-3 leading-6">{r.serverName || "-"}</td>
                    <td className="py-4 px-3 text-[13px] text-gray-700 leading-6">{formatDateTimeShanghai(r.disabledAt)}</td>
                    <td className="py-4 px-3 text-[13px] text-gray-700 leading-6">{formatDateTimeShanghai(r.unlockAt)}</td>
                    <td className="py-4 px-3 leading-6">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{statusText}</span>
                        {canManualUnban ? (
                          <button
                            type="button"
                            className="border border-[#e3001b] text-[#e3001b] bg-white rounded-md px-2 py-1 text-xs hover:bg-[#fff3f4] disabled:opacity-50"
                            onClick={() => manualUnban(r.id)}
                            disabled={unbanningId === r.id}
                          >
                            {unbanningId === r.id ? "解禁中..." : "解禁"}
                          </button>
                        ) : null}
                      </div>
                    </td>
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
  );
}
