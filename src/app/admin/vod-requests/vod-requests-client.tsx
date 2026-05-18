"use client";

import { UiImage } from "@/components/ui-image";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { PaginationBar } from "@/components/pagination-bar";

type BizStatus = "PENDING" | "NO_RESOURCE" | "PROCESSING" | "CANNOT_UPDATE" | "COMPLETED";

type RelatedRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  bizStatus: BizStatus;
  note: string | null;
  adminNote: string | null;
  createdAt: string;
  user: { id: string; username: string; email: string | null };
};

type Row = {
  id: string;
  tmdbId: number;
  mediaType: "MOVIE" | "TV";
  title: string;
  titleOriginal: string;
  posterPath: string | null;
  year: string | null;
  season: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  bizStatus: BizStatus;
  note: string | null;
  adminNote: string | null;
  createdAt: string;
  user: { id: string; username: string; email: string | null };
  requestCount: number;
  otherRequests: RelatedRequest[];
};

type Resp = {
  ok: boolean;
  error?: string;
  summary: {
    total: number;
    pending: number;
    noResource: number;
    processing: number;
    cannotUpdate: number;
    completed: number;
    recentTvCount: number;
    recentMovieCount: number;
    recentTopUser: string;
    recentTopUserCount: number;
  };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  rows: Row[];
};

const BIZ_STATUS_OPTIONS: Array<{ value: BizStatus; label: string }> = [
  { value: "PENDING", label: "待处理" },
  { value: "NO_RESOURCE", label: "无资源" },
  { value: "PROCESSING", label: "进行中" },
  { value: "CANNOT_UPDATE", label: "无法更新" },
  { value: "COMPLETED", label: "已完成" },
];
const ACTION_MENU_WIDTH = 128;
const ACTION_MENU_ESTIMATED_HEIGHT = 190;
const ACTION_MENU_GAP = 6;

function fmt(v?: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }).replace(/\//g, "-");
}

function deriveBizStatus(r: { bizStatus: BizStatus }) {
  return r.bizStatus;
}

function statusText(v: BizStatus) {
  if (v === "PENDING") return "待处理";
  if (v === "NO_RESOURCE") return "无资源";
  if (v === "PROCESSING") return "进行中";
  if (v === "CANNOT_UPDATE") return "无法更新";
  return "已完成";
}

function statusCls(v: BizStatus) {
  if (v === "PENDING") return "border-[#d4e6f2] bg-[#f0f8ff] text-[#1e73be]";
  if (v === "NO_RESOURCE") return "border-red-200 bg-red-50 text-red-600";
  if (v === "PROCESSING") return "border-amber-200 bg-amber-50 text-amber-700";
  if (v === "CANNOT_UPDATE") return "border-purple-200 bg-purple-50 text-purple-700";
  return "border-green-200 bg-green-50 text-green-700";
}

function deleteStatusCls() {
  return "border-red-200 bg-red-50 text-red-600";
}

function tmdbUrl(r: Row) {
  if (!r.tmdbId) return null;
  return `https://www.themoviedb.org/${r.mediaType === "MOVIE" ? "movie" : "tv"}/${r.tmdbId}`;
}

function userLabel(user: { username: string; email: string | null }) {
  return user.username || user.email || "-";
}

export function VodRequestsAdminClient() {
  const [q, setQ] = useState("");
  const [bizStatus, setBizStatus] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, noResource: 0, processing: 0, cannotUpdate: 0, completed: 0, recentTvCount: 0, recentMovieCount: 0, recentTopUser: "-", recentTopUserCount: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});
  const [actionMenu, setActionMenu] = useState<{ id: string; left: number; top: number; placement: "up" | "down" } | null>(null);
  const [noteTooltipId, setNoteTooltipId] = useState<string | null>(null);
  const [noteDialog, setNoteDialog] = useState<{ open: boolean; text: string }>({ open: false, text: "" });
  const [openMoreId, setOpenMoreId] = useState<string | null>(null);
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  async function refresh(nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      if (q.trim()) qs.set("q", q.trim());
      if (bizStatus) qs.set("bizStatus", bizStatus);
      if (mediaType) qs.set("mediaType", mediaType);
      const res = await fetch(`/api/admin/vod-requests?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as Resp | null;
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setRows(Array.isArray(json?.rows) ? json.rows : []);
      setSummary(json?.summary || { total: 0, pending: 0, noResource: 0, processing: 0, cannotUpdate: 0, completed: 0, recentTvCount: 0, recentMovieCount: 0, recentTopUser: "-", recentTopUserCount: 0 });
      setPage(json?.pagination?.page || 1);
      setPageSize(json?.pagination?.pageSize || nextPageSize);
      setTotal(json?.pagination?.total || 0);
      setTotalPages(json?.pagination?.totalPages || 1);
      setReplyMap((prev) => {
        const out = { ...prev };
        for (const r of json?.rows || []) {
          out[r.id] = r.adminNote || "";
          for (const item of r.otherRequests || []) {
            out[item.id] = item.adminNote || "";
          }
        }
        return out;
      });
      setActionMenu(null);
      setOpenMoreId((prev) => ((json?.rows || []).some((r) => r.id === prev) ? prev : null));
    } catch (e) {
      setError((e as Error)?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, bizStatus, mediaType]);

  useEffect(() => {
    const timers = saveTimerRef.current;
    return () => {
      for (const k of Object.keys(timers)) {
        clearTimeout(timers[k]);
      }
    };
  }, []);

  useEffect(() => {
    if (!actionMenu) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-vod-action-menu='1']")) return;
      setActionMenu(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [actionMenu]);

  async function patchRow(id: string, body: { status?: Row["status"]; bizStatus?: BizStatus; adminNote?: string }) {
    const res = await fetch(`/api/admin/vod-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error((json as Resp)?.error || `HTTP ${res.status}`);
  }

  async function applyQuickAction(row: Pick<Row, "id" | "status"> | Pick<RelatedRequest, "id" | "status">, action: BizStatus) {
    if (!action) return;
    const nextStatus: Row["status"] = action === "COMPLETED" ? "APPROVED" : action === "PENDING" || action === "PROCESSING" ? "PENDING" : "REJECTED";

    const manualReply = (replyMap[row.id] || "").trim().slice(0, 40);

    await patchRow(row.id, { status: nextStatus, bizStatus: action, adminNote: manualReply || undefined });
    setReplyMap((m) => ({ ...m, [row.id]: manualReply }));
    await refresh(page, pageSize);
  }

  async function deleteRow(id: string) {
    const ok = await (window as unknown as { showConfirm: (msg: string) => Promise<boolean> }).showConfirm("确认删除该点播记录吗？\n\n删除后用户侧也会同步消失。\n\n此操作不可恢复！");
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/vod-requests/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await refresh(page, pageSize);
    } catch (e) {
      alert(`删除失败：${(e as Error)?.message || "unknown_error"}`);
    }
  }

  function saveReplyDebounced(id: string, value: string) {
    if (saveTimerRef.current[id]) clearTimeout(saveTimerRef.current[id]);
    saveTimerRef.current[id] = setTimeout(async () => {
      try {
        await patchRow(id, { adminNote: value.slice(0, 40) });
      } catch {}
    }, 300);
  }

  function getActionMenuPosition(button: HTMLButtonElement, placementOverride?: "up" | "down") {
    const rect = button.getBoundingClientRect();
    const minLeft = ACTION_MENU_WIDTH / 2 + 8;
    const maxLeft = window.innerWidth - ACTION_MENU_WIDTH / 2 - 8;
    const left = Math.min(Math.max(rect.left + rect.width / 2, minLeft), Math.max(minLeft, maxLeft));
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placement =
      placementOverride ??
      (spaceBelow < ACTION_MENU_ESTIMATED_HEIGHT + ACTION_MENU_GAP && spaceAbove >= ACTION_MENU_ESTIMATED_HEIGHT + ACTION_MENU_GAP ? "up" : "down");
    const top =
      placement === "up"
        ? Math.max(8, rect.top - ACTION_MENU_GAP - ACTION_MENU_ESTIMATED_HEIGHT)
        : Math.min(rect.bottom + ACTION_MENU_GAP, Math.max(8, window.innerHeight - ACTION_MENU_ESTIMATED_HEIGHT - 8));

    return { left, top, placement };
  }

  function openStatusMenu(id: string, button: HTMLButtonElement) {
    const current = getActionMenuPosition(button);
    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < ACTION_MENU_ESTIMATED_HEIGHT + ACTION_MENU_GAP && spaceAbove < ACTION_MENU_ESTIMATED_HEIGHT + ACTION_MENU_GAP) {
      button.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      requestAnimationFrame(() => setActionMenu({ id, ...getActionMenuPosition(button, "down") }));
      return;
    }

    setActionMenu({ id, ...current });
  }

  function renderStatusActionMenu(row: Pick<Row, "id" | "status" | "bizStatus"> | Pick<RelatedRequest, "id" | "status" | "bizStatus">) {
    const current = deriveBizStatus(row);
    const isOpen = actionMenu?.id === row.id;

    return (
      <div className="relative inline-block" data-vod-action-menu="1">
        <button
          type="button"
          className={`inline-flex h-7 min-w-[76px] items-center justify-center rounded-full border px-2.5 text-xs font-medium transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 ${statusCls(current)}`}
          disabled={loading}
          onClick={(e) => {
            if (isOpen) {
              setActionMenu(null);
              return;
            }
            openStatusMenu(row.id, e.currentTarget);
          }}
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          {statusText(current)}
          <span className="ml-1 text-[10px]">▾</span>
        </button>
        {isOpen ? (
          <div
            className="fixed z-50 flex w-32 -translate-x-1/2 flex-col gap-1 rounded-xl border border-[#eaeaea] bg-white p-1.5 shadow-lg"
            style={{ left: actionMenu.left, top: actionMenu.top }}
          >
            {BIZ_STATUS_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`flex w-full shrink-0 items-center justify-center rounded-full border px-2 py-1 text-xs font-medium transition hover:brightness-95 ${statusCls(item.value)}`}
                onClick={async () => {
                  setActionMenu(null);
                  await applyQuickAction(row, item.value);
                }}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className={`flex w-full shrink-0 items-center justify-center rounded-full border px-2 py-1 text-xs font-medium transition hover:brightness-95 ${deleteStatusCls()}`}
              onClick={async () => {
                setActionMenu(null);
                await deleteRow(row.id);
              }}
            >
              删除
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const visibleRows = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">点播管理</h1>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm"><div className="text-xs text-gray-500">总计</div><div className="text-2xl text-gray-800">{summary.total}</div></div>
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm"><div className="text-xs text-gray-500">待处理</div><div className="text-2xl text-[#e3001b]">{summary.pending}</div></div>
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm"><div className="text-xs text-gray-500">无资源</div><div className="text-2xl text-red-600">{summary.noResource}</div></div>
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm"><div className="text-xs text-gray-500">进行中</div><div className="text-2xl text-amber-600">{summary.processing}</div></div>
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm"><div className="text-xs text-gray-500">无法更新</div><div className="text-2xl text-purple-600">{summary.cannotUpdate}</div></div>
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm"><div className="text-xs text-gray-500">已完成</div><div className="text-2xl text-green-600">{summary.completed}</div></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500">近30日电视剧点播数量</div>
          <div className="text-2xl text-purple-700">{summary.recentTvCount}</div>
        </div>
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500">近30日电影点播数量</div>
          <div className="text-2xl text-[#e3001b]">{summary.recentMovieCount}</div>
        </div>
        <div className="border border-[#eaeaea] bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500">近30日提交最多用户</div>
          <div className="text-base font-medium text-gray-800 truncate">{summary.recentTopUser}</div>
          <div className="text-xs text-gray-500 mt-1">{summary.recentTopUserCount} 条</div>
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-2 bg-white border border-[#eaeaea] rounded-xl p-2 shadow-sm">
        <input className="w-full md:w-72 h-8 border border-transparent bg-[#f4f5f7] rounded-lg px-3 text-sm focus:border-[#e3001b] outline-none" placeholder="搜索标题或用户名" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="h-8 border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 text-sm focus:border-[#e3001b] outline-none" value={bizStatus} onChange={(e) => setBizStatus(e.target.value)}>
          <option value="">选择状态</option>
          <option value="PENDING">待处理</option>
          <option value="NO_RESOURCE">无资源</option>
          <option value="PROCESSING">进行中</option>
          <option value="CANNOT_UPDATE">无法更新</option>
          <option value="COMPLETED">已完成</option>
        </select>
        <select className="h-8 border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 text-sm focus:border-[#e3001b] outline-none" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
          <option value="">选择类型</option>
          <option value="MOVIE">电影</option>
          <option value="TV">电视剧</option>
        </select>
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-2xl overflow-auto shadow-sm">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="border-b border-[#eaeaea] text-left text-[#666] bg-[#f8f9fa]">
            <tr>
              <th className="px-3 py-2">媒体信息</th>
              <th className="px-3 py-2">用户</th>
              <th className="px-3 py-2">用户备注</th>
              <th className="px-3 py-2">管理员回复</th>
              <th className="px-3 py-2">请求时间</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <Fragment key={r.id}>
                <tr key={r.id} className="border-b border-[#eaeaea] align-middle">
                  <td className="px-3 py-3 align-middle">
                    <div className="flex items-center gap-2 min-w-[260px]">
                      {tmdbUrl(r) ? (
                        <a
                          href={tmdbUrl(r) || undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="block shrink-0 rounded transition hover:opacity-90"
                          title="在 TMDB 中查看"
                        >
                          {r.posterPath ? <UiImage src={r.posterPath} alt={r.title} className="w-10 h-14 rounded object-cover" /> : <div className="w-10 h-14 rounded bg-gray-100" />}
                        </a>
                      ) : r.posterPath ? (
                        <UiImage src={r.posterPath} alt={r.title} className="w-10 h-14 rounded object-cover" />
                      ) : (
                        <div className="w-10 h-14 rounded bg-gray-100" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          {tmdbUrl(r) ? (
                            <a
                              href={tmdbUrl(r) || undefined}
                              target="_blank"
                              rel="noreferrer"
                              className="block min-w-0 truncate font-medium text-gray-800 transition hover:text-[#e3001b] hover:underline"
                              title="在 TMDB 中查看"
                            >
                              {r.title}
                            </a>
                          ) : (
                            <div className="min-w-0 truncate font-medium text-gray-800">{r.title}</div>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{r.titleOriginal || "-"}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] text-white ${r.mediaType === "MOVIE" ? "bg-[#913edb]" : "bg-[#e3001b]"}`}>{r.mediaType === "MOVIE" ? "电影" : "电视剧"}</span>
                          <span className="text-xs text-gray-500">{r.mediaType === "TV" && r.season ? `S${String(r.season).padStart(2, "0")} · ` : ""}{r.year || "-"}</span>
                          {r.otherRequests.length > 0 ? (
                            <button
                              type="button"
                              className="shrink-0 rounded p-1 hover:bg-[#f4f5f7] transition"
                              onClick={() => setOpenMoreId(openMoreId === r.id ? null : r.id)}
                              title={`展开其余 ${r.otherRequests.length} 位点播用户`}
                              aria-label={`展开其余 ${r.otherRequests.length} 位点播用户`}
                            >
                              <UiImage src="/icons/more.svg" alt="更多点播用户" className={`w-4 h-4 transition ${openMoreId === r.id ? "rotate-180" : ""}`} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap align-middle">{userLabel(r.user)}</td>
                  <td className="px-3 py-3 align-middle">
                    {r.note ? (
                      <div className="relative inline-block">
                        <button
                          type="button"
                          className="p-0.5 hover:bg-[#f4f5f7] rounded flex items-center justify-center"
                          style={{ minWidth: "20px", minHeight: "20px" }}
                          onMouseEnter={() => setNoteTooltipId(r.id)}
                          onMouseLeave={() => setNoteTooltipId(null)}
                          onClick={() => {
                            setNoteTooltipId(null);
                            setNoteDialog({ open: true, text: r.note || "" });
                          }}
                          aria-label="查看备注"
                        >
                          <UiImage src="/icons/exclamation.svg" alt="备注" className="w-4 h-4 flex-shrink-0" style={{ width: "16px", height: "16px" }} />
                        </button>
                        {noteTooltipId === r.id && (
                          <div className="absolute left-0 bottom-full mb-1 z-[100] w-64 rounded-xl border border-[#f3d4d8] bg-white text-gray-800 text-xs leading-relaxed px-3 py-2 shadow-lg">
                            <div className="font-medium text-gray-700 mb-1">用户备注</div>
                            <div className="break-words">{r.note}</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3 min-w-[220px] align-middle">
                    <input
                      className="w-full h-8 border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-2 text-xs focus:border-[#e3001b] outline-none"
                      maxLength={40}
                      value={replyMap[r.id] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[\r\n]/g, "").slice(0, 40);
                        setReplyMap((m) => ({ ...m, [r.id]: v }));
                        saveReplyDebounced(r.id, v);
                      }}
                      placeholder="给用户的回复（最多20字）"
                    />
                    <div className="text-[10px] text-gray-400 text-right mt-1">{(replyMap[r.id] || "").length}/20</div>
                  </td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap align-middle">{fmt(r.createdAt)}</td>
                  <td className="px-3 py-3 whitespace-nowrap align-middle">
                    {renderStatusActionMenu(r)}
                  </td>
                </tr>
                {openMoreId === r.id
                  ? r.otherRequests.map((item) => (
                      <tr key={item.id} className="border-b border-[#eaeaea] align-middle bg-[#fcfcfd]">
                        <td className="px-3 py-3 align-middle">
                          <div className="pl-12 text-xs text-gray-400">↳ 同媒体其他点播用户</div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap align-middle">{userLabel(item.user)}</td>
                        <td className="px-3 py-3 align-middle">
                          {item.note ? (
                            <div className="relative inline-block">
                              <button
                                type="button"
                                className="p-0.5 hover:bg-[#f4f5f7] rounded flex items-center justify-center"
                                style={{ minWidth: "20px", minHeight: "20px" }}
                                onMouseEnter={() => setNoteTooltipId(item.id)}
                                onMouseLeave={() => setNoteTooltipId(null)}
                                onClick={() => {
                                  setNoteTooltipId(null);
                                  setNoteDialog({ open: true, text: item.note || "" });
                                }}
                                aria-label="查看备注"
                              >
                                <UiImage src="/icons/exclamation.svg" alt="备注" className="w-4 h-4 flex-shrink-0" style={{ width: "16px", height: "16px" }} />
                              </button>
                              {noteTooltipId === item.id && (
                                <div className="absolute left-0 bottom-full mb-1 z-[100] w-64 rounded-xl border border-[#f3d4d8] bg-white text-gray-800 text-xs leading-relaxed px-3 py-2 shadow-lg">
                                  <div className="font-medium text-gray-700 mb-1">用户备注</div>
                                  <div className="break-words">{item.note}</div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 min-w-[220px] align-middle">
                          <input
                            className="w-full h-8 border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-2 text-xs focus:border-[#e3001b] outline-none"
                            maxLength={40}
                            value={replyMap[item.id] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[\r\n]/g, "").slice(0, 40);
                              setReplyMap((m) => ({ ...m, [item.id]: v }));
                              saveReplyDebounced(item.id, v);
                            }}
                            placeholder="给用户的回复（最多20字）"
                          />
                          <div className="text-[10px] text-gray-400 text-right mt-1">{(replyMap[item.id] || "").length}/20</div>
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap align-middle">{fmt(item.createdAt)}</td>
                        <td className="px-3 py-3 whitespace-nowrap align-middle">
                          {renderStatusActionMenu(item)}
                        </td>
                      </tr>
                    ))
                  : null}
              </Fragment>
            ))}
            {!loading && visibleRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-gray-500">暂无点播申请</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {noteDialog.open ? (
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45" onClick={() => setNoteDialog({ open: false, text: "" })} />
          <div className="relative w-full max-w-[360px] rounded-2xl border border-[#eaeaea] bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-800">用户备注</div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#f2d4d9] bg-[#fff7f8] hover:border-[#e3001b] hover:bg-[#fff0f1]"
                onClick={() => setNoteDialog({ open: false, text: "" })}
                aria-label="关闭备注弹窗"
              >
                ×
              </button>
            </div>
            <textarea
              className="mt-3 h-auto w-full resize-none rounded-lg border border-[#eaeaea] bg-[#f8f9fa] px-3 py-2 text-sm leading-6 text-gray-700 outline-none"
              value={noteDialog.text}
              readOnly
              rows={6}
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="h-8 rounded-lg border border-[#eaeaea] bg-white px-3 text-xs hover:bg-[#f4f5f7]"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(noteDialog.text || "");
                    alert("已复制用户备注");
                  } catch {
                    alert("复制失败，请手动复制");
                  }
                }}
              >
                复制备注
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PaginationBar
        total={total}
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        onPageChange={(p) => refresh(p, pageSize)}
        onPageSizeChange={(n) => { setPageSize(n); refresh(1, n); }}
        pageSizeOptions={[10, 20, 30]}
      />
    </div>
  );
}
