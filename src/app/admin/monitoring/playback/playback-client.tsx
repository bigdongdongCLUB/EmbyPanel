"use client";

import { useMemo, useRef, useState } from "react";
import { PaginationBar } from "@/components/pagination-bar";

type RecordRow = {
  serverId: string;
  serverName: string;
  mediaName: string;
  mediaKey: string;
  client: string;
  ip: string;
  lastPlayedAt: string;
};

type Data = {
  ok: true;
  username: string;
  rangeDays: 7 | 30 | 90;
  summary: {
    watchedItemCount: number;
    totalRecords: number;
  };
  records: RecordRow[];
};

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

export function AdminPlaybackStatsClient() {
  const [usernameInput, setUsernameInput] = useState("");
  const [searchedUsername, setSearchedUsername] = useState("");
  const rangeDays: 7 | 30 | 90 = 7;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const [openTitleKey, setOpenTitleKey] = useState<string | null>(null);

  async function searchPlayback(targetUsername?: string) {
    const u = String(targetUsername ?? usernameInput).trim();
    if (!u) {
      setError("请输入用户名");
      setData(null);
      setSearchedUsername("");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/monitoring/playback-stats?username=${encodeURIComponent(u)}&rangeDays=${rangeDays}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (json?.error === "user_not_found") {
          setError("未找到该用户");
        } else {
          setError(json?.error || `HTTP ${res.status}`);
        }
        setData(null);
        setSearchedUsername(u);
        return;
      }

      setData(json);
      setSearchedUsername(u);
      setPage(1);
      setOpenTitleKey(null);
    } finally {
      setLoading(false);
    }
  }

  const rows = data?.records ?? [];
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => rows.slice((safePage - 1) * pageSize, safePage * pageSize), [rows, safePage, pageSize]);

  function ensureTooltipVisibleByKey(tipKey: string) {
    const wrap = tableWrapRef.current;
    if (!wrap) return;

    requestAnimationFrame(() => {
      const tipEl = wrap.querySelector(`[data-tip-key="${tipKey}"]`) as HTMLElement | null;
      if (!tipEl) return;

      const wrapRect = wrap.getBoundingClientRect();
      const tipRect = tipEl.getBoundingClientRect();

      const overflowBottom = tipRect.bottom - wrapRect.bottom;
      if (overflowBottom > 0) {
        wrap.scrollBy({ top: overflowBottom + 10, behavior: "smooth" });
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#eaeaea] rounded-xl p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="w-[260px] border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none"
            placeholder="输入用户名搜索播放统计"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                searchPlayback();
              }
            }}
          />


          <button
            className="bg-[#e3001b] hover:bg-[#c20017] text-white rounded-lg px-3 py-2 disabled:opacity-60"
            onClick={() => searchPlayback()}
            disabled={loading}
          >
            {loading ? "搜索中..." : "搜索"}
          </button>

          <button
            className="border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none disabled:opacity-60"
            onClick={() => searchPlayback(searchedUsername)}
            disabled={loading || !searchedUsername}
          >
            刷新
          </button>

          {searchedUsername ? <span className="text-sm text-[#666]">当前用户：{searchedUsername}</span> : null}
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {!searchedUsername && !loading ? <div className="text-sm text-gray-500">请输入用户名后搜索播放统计。</div> : null}

      {searchedUsername ? (
        <>
          <div className="rounded-2xl border border-transparent bg-[#f8f9fa] p-6 max-w-sm">
            <div className="text-sm text-[#888]">观看影片数量</div>
            <div className="text-3xl font-bold text-[#222] mt-2">{data?.summary.watchedItemCount ?? 0} <span className="text-sm font-normal">部</span></div>
          </div>

          <div className="border border-[#eaeaea] rounded-2xl overflow-hidden bg-white">
            <div className="px-5 py-3 border-b border-[#eaeaea] font-semibold text-[#222]">播放记录</div>
            <div ref={tableWrapRef} className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f8f9fa] text-[#666]">
                  <tr>
                    <th className="text-left px-4 py-3 whitespace-nowrap">服务器名称</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">媒体名称</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">客户端</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">IP地址</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">开始播放时间</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-10 text-center text-[#888]" colSpan={5}>暂无记录</td>
                    </tr>
                  ) : (
                    pageRows.map((r, i) => (
                      <tr key={`${r.serverName}_${r.mediaName}_${r.lastPlayedAt}_${i}`} className="border-t border-[#eaeaea]">
                        <td className="px-4 py-3 text-[#222]">{r.serverName}</td>
                        <td className="px-4 py-3 text-[#222]">
                          <div className="relative inline-block max-w-[520px] align-middle">
                            <button
                              type="button"
                              className="text-left hover:text-[#e3001b]"
                              onClick={() => {
                                if (!isTrimmed(r.mediaName, 40)) return;
                                const key = `${safePage}-${i}`;
                                const next = openTitleKey === key ? null : key;
                                setOpenTitleKey(next);
                                if (next) ensureTooltipVisibleByKey(next);
                              }}
                              title={r.mediaName}
                            >
                              {trimTitle(r.mediaName, 40)}
                            </button>
                            {isTrimmed(r.mediaName, 40) && openTitleKey === `${safePage}-${i}` ? (
                              <div data-tip-key={`${safePage}-${i}`} className="absolute left-0 top-full z-20 mt-1 min-w-[260px] max-w-[560px] rounded border border-[#eaeaea] bg-[#222] px-2 py-1 text-xs text-white shadow-lg">
                                {r.mediaName}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#666]">{r.client || "-"}</td>
                        <td className="px-4 py-3 text-[#666]">{r.ip || "-"}</td>
                        <td className="px-4 py-3 text-[#666]">{fmtTime(r.lastPlayedAt)}</td>
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
        </>
      ) : null}
    </div>
  );
}
