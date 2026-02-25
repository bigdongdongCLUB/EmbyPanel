"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  note: string | null;
  adminNote: string | null;
  createdAt: string;
  user: { id: string; username: string; email: string | null };
};

type Resp = {
  ok: boolean;
  summary: { total: number; pending: number; noResource: number; processing: number; cannotUpdate: number; completed: number };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  rows: Row[];
};

function fmt(v?: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }).replace(/\//g, "-");
}

type BizStatus = "PENDING" | "NO_RESOURCE" | "PROCESSING" | "CANNOT_UPDATE" | "COMPLETED";

function deriveBizStatus(r: Row): BizStatus {
  const note = (r.adminNote || "").trim();
  if (r.status === "APPROVED") return "COMPLETED";
  if (r.status === "CANCELLED") return "PROCESSING";
  if (r.status === "PENDING") return note.includes("进行中") ? "PROCESSING" : "PENDING";
  if (note.includes("无资源")) return "NO_RESOURCE";
  if (note.includes("无法更新")) return "CANNOT_UPDATE";
  if (note.includes("已完成")) return "COMPLETED";
  return "NO_RESOURCE";
}

function statusText(v: BizStatus) {
  if (v === "PENDING") return "待处理";
  if (v === "NO_RESOURCE") return "无资源";
  if (v === "PROCESSING") return "进行中";
  if (v === "CANNOT_UPDATE") return "无法更新";
  return "已完成";
}

function statusCls(v: BizStatus) {
  if (v === "PENDING") return "border-blue-200 bg-blue-50 text-blue-700";
  if (v === "NO_RESOURCE") return "border-red-200 bg-red-50 text-red-600";
  if (v === "PROCESSING") return "border-amber-200 bg-amber-50 text-amber-700";
  if (v === "CANNOT_UPDATE") return "border-purple-200 bg-purple-50 text-purple-700";
  return "border-green-200 bg-green-50 text-green-700";
}

export function VodRequestsAdminClient() {
  const [q, setQ] = useState("");
  const [bizStatus, setBizStatus] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, noResource: 0, processing: 0, cannotUpdate: 0, completed: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});
  const [actionMap, setActionMap] = useState<Record<string, string>>({});
  const saveTimerRef = useRef<Record<string, any>>({});

  const canPrev = page > 1;
  const canNext = page < totalPages;

  async function refresh(nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      if (q.trim()) qs.set("q", q.trim());
      if (bizStatus) qs.set("bizStatus", bizStatus);
      if (mediaType) qs.set("mediaType", mediaType);
      const res = await fetch(`/api/admin/vod-requests?${qs.toString()}`, { cache: "no-store" });
      const json: Resp = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setSummary(json.summary || { total: 0, pending: 0, noResource: 0, processing: 0, cannotUpdate: 0, completed: 0 });
      setPage(json.pagination?.page || 1);
      setPageSize(json.pagination?.pageSize || nextPageSize);
      setTotal(json.pagination?.total || 0);
      setTotalPages(json.pagination?.totalPages || 1);
      setReplyMap((prev) => {
        const out = { ...prev };
        for (const r of json.rows || []) {
          out[r.id] = r.adminNote || "";
        }
        return out;
      });
    } catch (e: any) {
      setError(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, bizStatus, mediaType]);

  useEffect(() => {
    return () => {
      for (const k of Object.keys(saveTimerRef.current)) {
        clearTimeout(saveTimerRef.current[k]);
      }
    };
  }, []);

  async function patchRow(id: string, body: { status?: Row["status"]; adminNote?: string }) {
    const res = await fetch(`/api/admin/vod-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
  }

  async function applyQuickAction(row: Row, action: "PENDING" | "NO_RESOURCE" | "PROCESSING" | "CANNOT_UPDATE" | "COMPLETED") {
    if (!action) return;
    const nextStatus: Row["status"] = action === "COMPLETED" ? "APPROVED" : action === "PENDING" ? "PENDING" : action === "PROCESSING" ? "CANCELLED" : "REJECTED";

    // 状态切换不自动写入管理员回复；仅保留手动输入内容
    const manualReply = (replyMap[row.id] || "").trim().slice(0, 20);

    await patchRow(row.id, { status: nextStatus, adminNote: manualReply || undefined });
    setReplyMap((m) => ({ ...m, [row.id]: manualReply }));
    await refresh(page, pageSize);
  }

  function saveReplyDebounced(id: string, value: string) {
    if (saveTimerRef.current[id]) clearTimeout(saveTimerRef.current[id]);
    saveTimerRef.current[id] = setTimeout(async () => {
      try {
        await patchRow(id, { adminNote: value.slice(0, 20) });
      } catch {}
    }, 300);
  }

  const visibleRows = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">点播管理</h1>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="border rounded p-3"><div className="text-xs text-gray-500">总计</div><div className="text-2xl text-gray-800">{summary.total}</div></div>
        <div className="border rounded p-3"><div className="text-xs text-gray-500">待处理</div><div className="text-2xl text-blue-600">{summary.pending}</div></div>
        <div className="border rounded p-3"><div className="text-xs text-gray-500">无资源</div><div className="text-2xl text-red-600">{summary.noResource}</div></div>
        <div className="border rounded p-3"><div className="text-xs text-gray-500">进行中</div><div className="text-2xl text-amber-600">{summary.processing}</div></div>
        <div className="border rounded p-3"><div className="text-xs text-gray-500">无法更新</div><div className="text-2xl text-purple-600">{summary.cannotUpdate}</div></div>
        <div className="border rounded p-3"><div className="text-xs text-gray-500">已完成</div><div className="text-2xl text-green-600">{summary.completed}</div></div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-2">
        <input className="w-full md:w-72 h-8 border rounded px-3 text-sm" placeholder="搜索标题或用户名" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="h-8 border rounded px-3 text-sm" value={bizStatus} onChange={(e) => setBizStatus(e.target.value)}>
          <option value="">选择状态</option>
          <option value="PENDING">待处理</option>
          <option value="NO_RESOURCE">无资源</option>
          <option value="PROCESSING">进行中</option>
          <option value="CANNOT_UPDATE">无法更新</option>
          <option value="COMPLETED">已完成</option>
        </select>
        <select className="h-8 border rounded px-3 text-sm" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
          <option value="">选择类型</option>
          <option value="MOVIE">电影</option>
          <option value="TV">电视剧</option>
        </select>
      </div>

      <div className="border rounded overflow-auto bg-white">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="border-b text-left text-gray-600 bg-gray-50">
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
              <tr key={r.id} className="border-b align-top">
                <td className="px-3 py-3">
                  <div className="flex items-start gap-2 min-w-[260px]">
                    {r.posterPath ? <img src={r.posterPath} alt={r.title} className="w-10 h-14 rounded object-cover" /> : <div className="w-10 h-14 rounded bg-gray-100" />}
                    <div className="min-w-0">
                      <div className="font-medium text-gray-800 truncate">{r.title}</div>
                      <div className="text-xs text-gray-500 truncate">{r.titleOriginal || "-"}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] mr-1 ${r.mediaType === "MOVIE" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>{r.mediaType === "MOVIE" ? "电影" : "电视剧"}</span>
                        {r.mediaType === "TV" && r.season ? `S${String(r.season).padStart(2, "0")} · ` : ""}{r.year || "-"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{r.user.username || r.user.email || "-"}</td>
                <td className="px-3 py-3 text-xs text-gray-600 max-w-[220px]">{r.note || "-"}</td>
                <td className="px-3 py-3 min-w-[220px]">
                  <input
                    className="w-full h-8 border rounded px-2 text-xs"
                    maxLength={20}
                    value={replyMap[r.id] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[\r\n]/g, "").slice(0, 20);
                      setReplyMap((m) => ({ ...m, [r.id]: v }));
                      saveReplyDebounced(r.id, v);
                    }}
                    placeholder="给用户的回复（最多20字）"
                  />
                  <div className="text-[10px] text-gray-400 text-right mt-1">{(replyMap[r.id] || "").length}/20</div>
                </td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">{fmt(r.createdAt)}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <select
                      className="h-8 border rounded px-2 text-xs"
                      value={actionMap[r.id] ?? ""}
                      disabled={loading}
                      onChange={(e) => {
                        const v = e.target.value as "" | "PENDING" | "NO_RESOURCE" | "PROCESSING" | "CANNOT_UPDATE" | "COMPLETED";
                        if (!v) return;
                        (async () => {
                          try {
                            await applyQuickAction(r, v as any);
                          } finally {
                            setActionMap((m) => ({ ...m, [r.id]: "" }));
                          }
                        })();
                      }}
                    >
                      <option value="">操作</option>
                      <option value="PENDING">待处理</option>
                      <option value="NO_RESOURCE">无资源</option>
                      <option value="PROCESSING">进行中</option>
                      <option value="CANNOT_UPDATE">无法更新</option>
                      <option value="COMPLETED">已完成</option>
                    </select>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusCls(deriveBizStatus(r))}`}>{statusText(deriveBizStatus(r))}</span>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && visibleRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-gray-500">暂无点播申请</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <div className="mr-auto text-gray-600">第 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} 条，共 {total} 条记录</div>
        <button className="border rounded px-2 py-1 disabled:opacity-40" disabled={!canPrev || loading} onClick={() => refresh(page - 1, pageSize)}>‹</button>
        <span className="border rounded px-2 py-1 text-blue-600">{page}</span>
        <button className="border rounded px-2 py-1 disabled:opacity-40" disabled={!canNext || loading} onClick={() => refresh(page + 1, pageSize)}>›</button>
        <select className="h-8 border rounded px-2" value={String(pageSize)} onChange={(e) => { const n = Number(e.target.value) || 10; setPageSize(n); refresh(1, n); }}>
          <option value="10">10 / page</option>
          <option value="20">20 / page</option>
          <option value="30">30 / page</option>
        </select>
      </div>
    </div>
  );
}
