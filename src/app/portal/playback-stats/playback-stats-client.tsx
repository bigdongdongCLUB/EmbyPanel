"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/pagination-bar";

type RecordRow = {
  serverName: string;
  mediaName: string;
  durationSeconds: number;
  client: string;
  ip: string;
  lastPlayedAt: string;
};

type Data = {
  ok: boolean;
  rangeDays: 7 | 30 | 90;
  summary: {
    totalDurationSeconds: number;
    watchedItemCount: number;
    totalRecords: number;
  };
  records: RecordRow[];
};

function fmtDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}小时${m}分钟`;
  if (s === 0) return "0分钟";
  return `${Math.max(1, m)}分钟`;
}

function fmtTime(v: string) {
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
}

function trimTitle(v: string, max = 40) {
  const s = String(v || "");
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

function isTrimmed(v: string, max = 40) {
  return String(v || "").length > max;
}

export function PortalPlaybackStatsClient() {
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function refresh(days = rangeDays) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/playback-stats?rangeDays=${days}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e: any) {
      setError(e?.message || "load_failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const rows = data?.records ?? [];
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => rows.slice((safePage - 1) * pageSize, safePage * pageSize), [rows, safePage, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">播放统计</h1>
        <button className="border rounded px-3 py-1.5" onClick={() => refresh()}>
          刷新
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span>时间范围：</span>
        <select
          className="border rounded px-2 py-1.5"
          value={String(rangeDays)}
          onChange={(e) => {
            const v = Number(e.target.value) as 7 | 30 | 90;
            setRangeDays(v);
            setPage(1);
            refresh(v);
          }}
        >
          <option value="7">最近7天</option>
          <option value="30">最近30天</option>
          <option value="90">最近90天</option>
        </select>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-500">总播放时长</div>
          <div className="text-2xl font-semibold mt-1">{fmtDuration(data?.summary.totalDurationSeconds ?? 0)}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-500">观看影片数量</div>
          <div className="text-2xl font-semibold mt-1">{data?.summary.watchedItemCount ?? 0} 部</div>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b font-medium">我的播放记录</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="text-left px-4 py-2 whitespace-nowrap">服务器名称</th>
                <th className="text-left px-4 py-2 whitespace-nowrap">媒体名称</th>
                <th className="text-left px-4 py-2 whitespace-nowrap">播放时长</th>
                <th className="text-left px-4 py-2 whitespace-nowrap">客户端</th>
                <th className="text-left px-4 py-2 whitespace-nowrap">IP地址</th>
                <th className="text-left px-4 py-2 whitespace-nowrap">最后播放时间</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-gray-500" colSpan={6}>暂无记录</td>
                </tr>
              ) : (
                pageRows.map((r, i) => (
                  <tr key={`${r.serverName}_${r.mediaName}_${r.lastPlayedAt}_${i}`} className="border-t">
                    <td className="px-4 py-2">{r.serverName}</td>
                    <td className="px-4 py-2">
                      <div className="relative group inline-block max-w-[520px] align-middle">
                        <span title={r.mediaName}>{trimTitle(r.mediaName, 40)}</span>
                        {isTrimmed(r.mediaName, 40) ? (
                          <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden min-w-[260px] max-w-[560px] rounded border bg-black px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                            {r.mediaName}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2">{fmtDuration(r.durationSeconds)}</td>
                    <td className="px-4 py-2">{r.client || "-"}</td>
                    <td className="px-4 py-2">{r.ip || "-"}</td>
                    <td className="px-4 py-2">{fmtTime(r.lastPlayedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          total={total}
          page={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[10, 20, 50]}
        />
      </div>
    </div>
  );
}
