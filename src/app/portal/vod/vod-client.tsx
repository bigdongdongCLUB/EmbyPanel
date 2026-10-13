"use client";

import { UiImage } from "@/components/ui-image";
import { useCallback, useEffect, useState } from "react";
import { PaginationBar } from "@/components/pagination-bar";
import { vodPointCost } from "@/lib/vod-points";
import { isVodContentInLibrary } from "@/lib/vod-library-status";

type MediaItem = {
  id: number;
  title: string;
  titleOriginal: string;
  posterPath: string | null;
  year: string;
  rating: number | null;
  mediaType: "movie" | "tv";
  requestedSeason?: number;
  requestCount?: number;
};

type Season = { seasonNumber: number; name: string; episodeCount: number; year?: string | null };

type ServerResult = {
  serverId: string;
  serverName: string;
  seasons: Record<number, boolean>;
  hasMovie: boolean;
};

type DetailData = {
  detail: {
    id: number;
    title: string;
    titleOriginal: string;
    overview: string;
    posterPath: string | null;
    year: string;
    rating: number | null;
    mediaType: string;
    seasons: Season[];
  };
  serverResults: ServerResult[];
};

type Quota = {
  dailyTotal: number;
  dailyRemaining: number;
  available: number;
  reserved: number;
  charged: number;
  total: number;
  nextReset: string;
  month: string;
};

type Tab = "now_playing_movie" | "now_playing_tv" | "popular_movie" | "popular_tv" | "requested_movie" | "requested_tv";
const MAX_DISCOVER_PAGES = 10;

function mediaItemKey(item: Pick<MediaItem, "id" | "mediaType" | "requestedSeason">) {
  return `${item.mediaType}:${item.id}${item.mediaType === "tv" && item.requestedSeason ? `:s${item.requestedSeason}` : ""}`;
}

function isInLibraryByDetail(detailData: DetailData | null | undefined) {
  if (!detailData) return false;
  const { detail, serverResults } = detailData;
  const isTv = detail.mediaType === "tv";
  if (isTv) {
    return serverResults.some((sr) => Object.values(sr.seasons).some(Boolean));
  }
  return serverResults.some((sr) => sr.hasMovie);
}

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "now_playing_movie", label: "最新电影", icon: "🎬" },
  { key: "now_playing_tv", label: "最新电视剧", icon: "📺" },
  { key: "popular_movie", label: "热门电影", icon: "🔥" },
  { key: "popular_tv", label: "热门电视剧", icon: "🔥" },
  { key: "requested_movie", label: "热门点播电影", icon: "🔝" },
  { key: "requested_tv", label: "热门点播电视剧", icon: "🔝" },
];

function PosterCard({ item, inLibrary, onClick }: { item: MediaItem; inLibrary: boolean; onClick: () => void }) {
  return (
    <div className="cursor-pointer group" onClick={onClick}>
      <div className="relative rounded-lg overflow-hidden aspect-[2/3] bg-gradient-to-br from-[#e4eaf5] to-[#cbd6e9] border-2 border-transparent transition-all duration-300 group-hover:border-[#e3001b] group-hover:shadow-[0_8px_24px_rgba(227,0,27,0.15)] group-hover:-translate-y-1">
        {item.posterPath ? (
          <UiImage src={item.posterPath} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs p-2 text-center">{item.title}</div>
        )}
        <div className="absolute top-1.5 left-1.5">
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded text-white shadow ${item.mediaType === "movie" ? "bg-[#913edb]" : "bg-[#e3001b]"}`}>
            {item.mediaType === "movie" ? "电影" : "电视剧"}
          </span>
        </div>
        {item.rating && item.rating > 0 ? (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-black/60 rounded px-1.5 py-0.5">
            <span className="text-yellow-400 text-[10px]">★</span>
            <span className="text-white text-[10px] font-medium">{item.rating}</span>
          </div>
        ) : null}
        {inLibrary && (
          <div className="absolute bottom-1.5 left-1.5">
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-white/90 text-[#222] shadow-sm border border-white/80">
              已入库
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <div className="text-sm font-bold text-[#222] truncate">{item.title}</div>
        <div className="text-xs text-[#888]">
          {item.requestedSeason ? `第${item.requestedSeason}季 · ` : ""}
          {item.year || "-"}
          {item.requestCount ? ` · ${item.requestCount}次点播` : ""}
        </div>
      </div>
    </div>
  );
}

function DetailModal({
  item,
  detail,
  onClose,
  onSubmit,
  vodEnabled,
  vodCanRequest,
  vodDisabledReason,
}: {
  item: MediaItem | null;
  detail: DetailData | null;
  onClose: () => void;
  onSubmit: (params: { season?: number; note: string; inLibraryConfirmed?: boolean }) => Promise<boolean>;
  vodEnabled: boolean;
  vodCanRequest: boolean;
  vodDisabledReason: string;
}) {
  const [selectedSeason, setSelectedSeason] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSeason(detail?.detail.mediaType === "tv" && item?.requestedSeason ? item.requestedSeason : "");
    setNote("");
    setSubmitError(null);
  }, [detail, item?.requestedSeason]);

  if (!detail || !item) return null;
  const { detail: d, serverResults } = detail;
  const isTv = d.mediaType === "tv";
  const seasons = d.seasons ?? [];
  const allExist = isInLibraryByDetail(detail);

  const overview = d.overview.length > 100 ? d.overview.slice(0, 100) + "…" : d.overview;
  const selectedInLibrary = isVodContentInLibrary(isTv ? "TV" : "MOVIE", serverResults, selectedSeason === "" ? undefined : selectedSeason);
  const pointCost = selectedInLibrary ? 0 : isTv && selectedSeason === "" ? null : vodPointCost(isTv ? "TV" : "MOVIE", isTv ? seasons.find((season) => season.seasonNumber === selectedSeason)?.year : d.year);
  const canSubmit = vodEnabled && vodCanRequest && (!isTv || selectedSeason !== "") && !submitting;

  const serverTableSeasons = seasons;

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (selectedInLibrary && !(await (window as unknown as { showConfirm: (message: string) => Promise<boolean> }).showConfirm("该内容已入库，你确定再次提交吗？"))) return;
      const submitted = await onSubmit({ season: isTv && selectedSeason !== "" ? Number(selectedSeason) : undefined, note, inLibraryConfirmed: selectedInLibrary });
      if (submitted) onClose();
    } catch (e) {
      const message = (e as Error)?.message ?? "提交失败";
      if (message === "请勿重复点播") {
        alert(message);
      } else {
        setSubmitError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border border-[#eaeaea] shadow-2xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto overscroll-contain">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-base font-semibold text-gray-800">确认点播请求</div>
            <button onClick={onClose} className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-[#f2d4d9] bg-[#fff7f8] hover:border-[#e3001b] hover:bg-[#fff0f1]" aria-label="关闭">
              <UiImage src="/icons/delete.svg" alt="关闭" className="h-3.5 w-3.5" />
            </button>
          </div>

          {allExist && (
            <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 mb-4">
              <span className="text-green-500 text-lg mt-0.5 shrink-0">✓</span>
              <div>
                <div className="font-medium text-green-800 text-sm">{isTv ? "该电视剧已存在于媒体库" : "该电影已存在于媒体库"}</div>
                <div className="text-xs text-green-700 mt-0.5">{isTv ? "该剧已有季入库。点播已入库的季免积分，未入库季按发行年份扣除积分。" : "该电影已入库，再次提交不消耗积分。"}</div>
              </div>
            </div>
          )}

          <div className="flex gap-3 mb-4">
            {d.posterPath ? (
              <UiImage src={d.posterPath} alt={d.title} className="w-20 h-28 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-20 h-28 rounded-lg bg-gray-100 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 text-base leading-snug">{d.title}</div>
              <div className="text-sm text-gray-500 mt-0.5">{d.titleOriginal}</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[#fff0f1] text-[#e3001b]">
                  {isTv ? "电视剧" : "电影"}
                </span>
                {d.year ? <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{d.year}</span> : null}
                {d.rating && d.rating > 0 ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 flex items-center gap-0.5">
                    <span className="text-amber-500">★</span>{d.rating}
                  </span>
                ) : null}
              </div>
              {overview ? <div className="text-xs text-gray-500 mt-2 leading-relaxed">{overview}</div> : null}
            </div>
          </div>

          {(
            <div className="flex gap-2 rounded-xl border border-[#f3d4d8] bg-[#fff7f8] px-4 py-3 mb-4">
              <span className="text-blue-500 shrink-0 mt-0.5 text-sm">ℹ</span>
              <div className="text-sm text-gray-700">
                <div className="font-medium text-gray-800 mb-0.5">点播说明</div>
                {pointCost === null ? "请先选择季，以查看本次点播所需积分。" : pointCost === 0 ? "该内容已入库，本次点播免积分。" : `本次点播需要 ${pointCost} 积分。`}
                提交请求后，管理员将审核您的请求。
                {pointCost !== 0 ? "提交时预占积分，管理员标记已入库后才实际扣除。" : null}
              </div>
            </div>
          )}

          {/* Server table */}
          {isTv && (
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-2">资源情况</div>
              {serverResults.length === 0 ? (
                <div className="text-xs text-gray-400 border rounded-lg px-3 py-3">暂无订阅服务器</div>
              ) : (
                <div
                  className={`rounded-lg border pb-1 ${serverTableSeasons.length > 4 ? "overflow-x-auto" : "overflow-x-hidden"}`}
                  style={serverTableSeasons.length > 4 ? { scrollbarWidth: "thin" } : undefined}
                >
                  <table
                    className="text-xs w-full"
                    style={serverTableSeasons.length > 4 ? { minWidth: `${Math.max(680, 180 + serverTableSeasons.length * 88)}px` } : undefined}
                  >
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">服务器</th>
                        {serverTableSeasons.map((s) => (
                          <th key={s.seasonNumber} className="px-3 py-2 text-center font-medium text-gray-600">S{String(s.seasonNumber).padStart(2, "0")}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {serverResults.map((sr) => (
                        <tr key={sr.serverId} className="border-t">
                          <td className="px-3 py-2 font-medium text-gray-700">{sr.serverName}</td>
                          {serverTableSeasons.map((s) => (
                            <td key={s.seasonNumber} className="px-3 py-2 text-center">
                              {sr.seasons[s.seasonNumber] ? (
                                <span className="inline-block text-[10px] px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-700">已上架</span>
                              ) : (
                                <span className="inline-block text-[10px] px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-500">无数据</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!isTv && serverResults.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-2">服务器资源</div>
              <div className="space-y-1">
                {serverResults.map((sr) => (
                  <div key={sr.serverId} className="flex items-center justify-between text-xs px-3 py-2 border rounded-lg">
                    <span className="font-medium text-gray-700">{sr.serverName}</span>
                    {sr.hasMovie ? (
                      <span className="text-[10px] px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-700">已上架</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-500">无数据</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isTv && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1 mb-1.5">
                选择季度 <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm focus:border-[#e3001b] outline-none"
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={submitting}
              >
                <option value="">请选择要点播的季度</option>
                {seasons.map((s) => (
                  <option key={s.seasonNumber} value={s.seasonNumber}>
                    第 {s.seasonNumber} 季 ({s.episodeCount} 集) · {s.year || "年份未知"} · {isVodContentInLibrary("TV", serverResults, s.seasonNumber) ? 0 : vodPointCost("TV", s.year)} 积分
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">注意：每次点播只能选择一个季度。</p>
            </div>
          )}

          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">备注（可选）</label>
            <textarea
              className="w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm resize-none focus:border-[#e3001b] outline-none"
              rows={3}
              maxLength={120}
              placeholder="可填写备注（最多120字）"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 120))}
            />
            <div className="text-right text-xs text-gray-400">{note.length} / 120</div>
          </div>

          {!vodEnabled || !vodCanRequest ? <div className="text-sm text-red-600 mb-3">{vodDisabledReason}</div> : null}
          {submitError && <div className="text-sm text-red-600 mb-3">{submitError}</div>}

          <div className="flex justify-end gap-2">
            <button className="px-4 py-2 rounded-lg border border-[#eaeaea] bg-white text-[#666] text-sm hover:bg-gray-50" onClick={onClose}>取消</button>
            <button
              className="px-4 py-2 rounded-lg bg-[#e3001b] text-white text-sm font-bold hover:bg-[#c20017] disabled:opacity-50"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {!vodEnabled || !vodCanRequest ? vodDisabledReason : submitting ? "提交中…" : "提交申请"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VodClient() {
  const [activeTab, setActiveTab] = useState<Tab>("now_playing_movie");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [inLibrarySet, setInLibrarySet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchTotal, setSearchTotal] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showMyRequests, setShowMyRequests] = useState(false);
  const [showPointRules, setShowPointRules] = useState(false);
  const [myRequests, setMyRequests] = useState<Array<{ id: string; title: string; year: string; mediaType: string; season?: number; bizStatus: string; posterPath: string | null; note?: string; adminNote?: string; pointCost?: number | null; pointState?: string | null; pointMonth?: string | null }>>([]);
  const [myReqPage, setMyReqPage] = useState(1);
  const [myReqTotalPages, setMyReqTotalPages] = useState(1);
  const [myReqTotal, setMyReqTotal] = useState(0);
  const [myReqLoading, setMyReqLoading] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [vodEnabled, setVodEnabled] = useState(true);
  const [vodCanRequest, setVodCanRequest] = useState(true);
  const [vodDisabledReason, setVodDisabledReason] = useState("目前点播功能暂未开启");

  const checkLibrary = useCallback(async (list: MediaItem[]) => {
    if (!list.length) {
      setInLibrarySet(new Set());
      return;
    }
    setInLibrarySet(new Set()); // reset while checking
    const results = await Promise.allSettled(
      list.map(async (item) => {
        const r = await fetch(`/api/portal/vod/detail?tmdb_id=${item.id}&media_type=${item.mediaType}`);
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) return null;
        return isInLibraryByDetail(j as DetailData) ? mediaItemKey(item) : null;
      })
    );
    const next = new Set<string>();
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) next.add(result.value);
    }
    setInLibrarySet(next);
  }, []);

  const loadTab = useCallback(async (tab: Tab, page = 1) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/vod/discover?category=${tab}&page=${page}`);
      const j = await r.json();
      const results = j?.results ?? [];
      const apiTotalPages = Math.max(1, Number(j?.totalPages ?? 1));
      const cappedTotalPages = Math.min(MAX_DISCOVER_PAGES, apiTotalPages);
      const safePage = Math.max(1, Math.min(cappedTotalPages, Number(j?.page ?? page)));
      setItems(results);
      setCurrentPage(safePage);
      setTotalPages(cappedTotalPages);
      checkLibrary(results);
    } finally { setLoading(false); }
  }, [checkLibrary]);

  useEffect(() => {
    fetch("/api/portal/vod/feature", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const enabled = Boolean(j?.enabled);
        const canRequest = Boolean(j?.canRequest ?? enabled);
        setVodEnabled(enabled);
        setVodCanRequest(canRequest);
        setVodDisabledReason(String(j?.reason || (enabled ? "无有效订阅计划，无法提交点播申请" : "目前点播功能暂未开启")));
      })
      .catch(() => {
        setVodEnabled(true);
        setVodCanRequest(true);
      });
  }, []);

  useEffect(() => { if (!searchQuery) loadTab(activeTab); }, [activeTab, searchQuery, loadTab]);

  async function doSearch(q: string, page = 1) {
    if (!q.trim()) { setSearchQuery(""); setSearchTotal(null); setCurrentPage(1); setTotalPages(1); return; }
    setSearchQuery(q);
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/vod/search?q=${encodeURIComponent(q)}&page=${page}`);
      const j = await r.json();
      const results = j?.results ?? [];
      setItems(results);
      setSearchTotal(j?.totalResults ?? 0);
      setCurrentPage(j?.page ?? page);
      setTotalPages(Math.max(1, Number(j?.totalPages ?? 1)));
      checkLibrary(results);
    } finally { setLoading(false); }
  }

  function clearSearch() {
    setSearchInput("");
    setSearchQuery("");
    setSearchTotal(null);
    setCurrentPage(1);
    setTotalPages(1);
  }

  async function changePage(nextPage: number) {
    const page = Math.max(1, Math.min(totalPages, nextPage));
    if (page === currentPage) return;
    if (searchQuery) await doSearch(searchQuery, page);
    else await loadTab(activeTab, page);
  }

  async function openDetail(item: MediaItem) {
    setSelectedItem(item);
    setDetailLoading(true);
    setSelectedDetail(null);
    try {
      const r = await fetch(`/api/portal/vod/detail?tmdb_id=${item.id}&media_type=${item.mediaType}`);
      const j = await r.json();
      if (j?.ok) {
        setSelectedDetail(j);
        if (isInLibraryByDetail(j as DetailData)) {
          setInLibrarySet((prev) => {
            const next = new Set(prev);
            next.add(mediaItemKey(item));
            return next;
          });
        } else {
          setInLibrarySet((prev) => {
            const next = new Set(prev);
            next.delete(mediaItemKey(item));
            return next;
          });
        }
      }
    } finally { setDetailLoading(false); }
  }

  async function loadMyRequests(page = 1) {
    setMyReqLoading(true);
    try {
      const r = await fetch(`/api/portal/vod/request?page=${page}&pageSize=5`, { cache: "no-store" });
      const j = await r.json();
      setMyRequests(j?.rows ?? []);
      setMyReqPage(j?.pagination?.page ?? page);
      setMyReqTotalPages(j?.pagination?.totalPages ?? 1);
      setMyReqTotal(j?.pagination?.total ?? 0);
    } finally {
      setMyReqLoading(false);
    }
  }

  async function loadVodQuota() {
    try {
      const r = await fetch("/api/portal/vod/quota", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) return;
      setQuota(j as Quota);
    } catch {
      // non-critical
    }
  }

  async function clearCompletedRequests() {
    const ok = await (window as unknown as { showConfirm: (msg: string) => Promise<boolean> }).showConfirm("确认清空所有已完成点播记录？");
    if (!ok) return;
    const r = await fetch("/api/portal/vod/request", { method: "DELETE" });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    await Promise.all([loadMyRequests(1), loadVodQuota()]);
  }

  async function deleteMyRequest(requestId: string) {
    const ok = await (window as unknown as { showConfirm: (msg: string) => Promise<boolean> }).showConfirm("确认删除这条点播记录？删除后仍会计入历史提交次数。");
    if (!ok) return;
    const r = await fetch(`/api/portal/vod/request?id=${encodeURIComponent(requestId)}`, { method: "DELETE" });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
    const nextPage = myRequests.length === 1 && myReqPage > 1 ? myReqPage - 1 : myReqPage;
    await Promise.all([loadMyRequests(nextPage), loadVodQuota()]);
  }

  async function submitRequest({ season, note, inLibraryConfirmed = false }: { season?: number; note: string; inLibraryConfirmed?: boolean }): Promise<boolean> {
    if (!vodEnabled || !vodCanRequest) throw new Error(vodDisabledReason);
    if (!selectedItem) throw new Error("no item");
    const r = await fetch("/api/portal/vod/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tmdbId: selectedItem.id,
        mediaType: selectedItem.mediaType === "movie" ? "MOVIE" : "TV",
        title: selectedItem.title,
        titleOriginal: selectedItem.titleOriginal,
        posterPath: selectedItem.posterPath,
        year: selectedItem.year,
        season,
        note,
        inLibraryConfirmed,
      }),
    });
    const j = await r.json();
    if (j?.error === "in_library_confirmation_required" && !inLibraryConfirmed) {
      const confirmed = await (window as unknown as { showConfirm: (message: string) => Promise<boolean> }).showConfirm("该内容已入库，你确定再次提交吗？");
      if (!confirmed) return false;
      return submitRequest({ season, note, inLibraryConfirmed: true });
    }
    if (!r.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
    await loadVodQuota();
    alert("点播请求已提交！");
    return true;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-[#222]">点播功能</div>
          {!vodEnabled || !vodCanRequest ? <div className="text-sm text-red-600 mt-1">{vodDisabledReason}</div> : null}
        </div>
        <button
          className="flex items-center gap-1.5 border border-[#eaeaea] bg-white rounded-lg px-3 py-2 text-sm text-[#666] hover:border-[#e3001b] hover:text-[#e3001b] shrink-0"
          onClick={async () => {
            await Promise.all([loadMyRequests(1), loadVodQuota()]);
            setShowMyRequests(true);
          }}
        >
          🕐 我的点播
        </button>
      </div>

      {/* Search */}
      <div className="bg-white border border-[#eaeaea] rounded-xl p-2 space-y-2 shadow-sm">
        <div className="flex gap-2">
          <div className="flex-1 flex items-center bg-[#f4f5f7] border border-transparent rounded-lg px-3 py-2 gap-2 focus-within:border-[#e3001b] focus-within:bg-white">
            <input
              className="flex-1 text-sm outline-none"
              placeholder="搜索电影或电视剧..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doSearch(searchInput); }}
            />
            {searchInput && (
              <button className="text-gray-300 hover:text-gray-500 text-sm" onClick={() => { clearSearch(); }}>✕</button>
            )}
          </div>
          <button className="px-6 py-2 bg-[#e3001b] text-white rounded-lg text-sm font-bold hover:bg-[#c20017] shrink-0" onClick={() => doSearch(searchInput)}>
            搜索
          </button>
          {searchQuery && (
            <button className="px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 shrink-0" onClick={clearSearch}>清除</button>
          )}
        </div>
        {searchTotal !== null && (
          <div className="flex items-center gap-2 text-sm text-[#e3001b] bg-[#fff7f8] border border-[#f3d4d8] rounded-lg px-3 py-2">
            <span className="text-sm">ℹ</span>
            <span>搜索结果：{searchTotal} 条</span>
            <button className="ml-auto text-gray-400 hover:text-gray-600" onClick={clearSearch}>✕</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        className="overflow-x-auto overflow-y-hidden overscroll-x-contain border-b border-[#eaeaea] pb-1 [scrollbar-width:thin] [scrollbar-color:#d1d5db_transparent]"
        style={{ touchAction: "pan-x" }}
      >
        <div className="flex min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`flex items-center gap-1.5 px-4 py-3 text-[15px] whitespace-nowrap border-b-2 -mb-px rounded-t-lg transition-all ${
                activeTab === tab.key && !searchQuery
                  ? "border-[#f3d4d8] bg-[#fff7f8] text-[#e3001b] font-bold shadow-[0_4px_12px_rgba(227,0,27,0.10)]"
                  : "border-transparent text-[#888] hover:text-[#222] hover:bg-[#fafafa]"
              }`}
              onClick={() => { setActiveTab(tab.key); clearSearch(); setCurrentPage(1); }}
            >
              <span>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {items.map((item) => (
              <PosterCard key={mediaItemKey(item)} item={item} inLibrary={inLibrarySet.has(mediaItemKey(item))} onClick={() => openDetail(item)} />
            ))}
            {items.length === 0 && (
              <div className="col-span-6 py-16 text-center text-gray-400 text-sm">暂无内容</div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="pt-2">
              <PaginationBar
                total={searchTotal ?? (totalPages === 1 ? items.length : totalPages * 20)}
                page={currentPage}
                totalPages={totalPages}
                pageSize={20}
                onPageChange={changePage}
                onPageSizeChange={() => {}}
                pageSizeOptions={[20]}
                showPageSize={false}
                compactSinglePage
                simpleGoto
              />
            </div>
          )}
        </>
      )}

      {/* Detail loading */}
      {detailLoading && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl px-8 py-6 text-gray-500 text-sm shadow-xl">加载中…</div>
        </div>
      )}

      {/* Detail modal */}
      {selectedDetail && !detailLoading && (
        <DetailModal
          item={selectedItem}
          detail={selectedDetail}
          onClose={() => { setSelectedDetail(null); setSelectedItem(null); }}
          onSubmit={submitRequest}
          vodEnabled={vodEnabled}
          vodCanRequest={vodCanRequest}
          vodDisabledReason={vodDisabledReason}
        />
      )}

      {showPointRules && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="点播积分规则">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="关闭积分规则" onClick={() => setShowPointRules(false)} />
          <div className="relative w-full max-w-[560px] max-h-[85vh] overflow-y-auto rounded-2xl border border-[#eaeaea] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-[#222]">点播积分规则</h2>
              <button type="button" aria-label="关闭" className="h-8 w-8 shrink-0 rounded-full border" onClick={() => setShowPointRules(false)}>×</button>
            </div>
            <div className="space-y-4 text-sm leading-6 text-[#555]">
              <p>每人每月获得 {quota?.total ?? 300} 积分，每月 1 日重置。不累积、不结转，当月额度用完需等待下月重置。</p>
              <div className="rounded-xl bg-[#f7f8fa] p-4">
                <p className="font-bold text-[#222]">电影：每部 10 积分，与发行年份无关。</p>
                <p className="mt-2 font-bold text-[#222]">电视剧：按每次点按季计算积分，以所选季的发行年份为准。</p>
                <ul className="mt-2 list-disc pl-5"><li>2015 年及以后（含 2015）：每季 10 积分。</li><li>2005—2014 年（含 2005）：每季 20 积分。</li><li>2005 年以前：每季 30 积分。</li><li>发行年份缺失时按 30 积分处理，最高为 30 积分。</li></ul>
              </div>
              <p>已入库的电影或所选电视剧季再次提交不消耗积分。</p>
              <p>提交请求时预占积分，管理员标记“已完成”后才实际扣除。“无资源”“无法更新”会释放预占；管理员撤销已入库状态时归还已扣积分。若重新进入待处理或进行中时再次预占积分。</p>
              <p>积分仅在提交当月结算。跨月的待处理请求不占用新月份积分；跨月后无论标记已入库、无资源或其他状态，均不再扣除或返还积分。同月积分不足时管理员无法完成入库结算。</p>
              <p>删除未入库点播会释放预占，删除已入库记录不返还已扣积分。删除记录后仍计入历史提交次数；若管理员之后将已删除的点播标记入库，仍按规则扣分。</p>
            </div>
          </div>
        </div>
      )}

      {/* My requests */}
      {showMyRequests && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMyRequests(false)} />
          <div className="relative bg-white w-full max-w-[560px] max-h-[85vh] rounded-[20px] border-2 border-[#e3001b] shadow-[0_12px_32px_rgba(227,0,27,0.10)] flex flex-col overflow-hidden">
            <div className="px-4 sm:px-7 py-5 border-b border-[#eaeaea] flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="text-[20px] font-bold text-[#222]">我的点播记录</div>
                <button type="button" title="积分规则说明" aria-label="积分规则说明" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#eaeaea] bg-white hover:border-[#e3001b]" onClick={() => setShowPointRules(true)}>
                  <UiImage src="/icons/exclamation.svg" alt="" className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 sm:gap-4">
                <button
                  className="border border-[#eaeaea] rounded-[8px] px-4 py-1.5 text-[13px] text-[#222] hover:border-[#e3001b] hover:text-[#e3001b] hover:bg-[#fff0f1] disabled:opacity-40"
                  disabled={myReqLoading}
                  onClick={async () => {
                    try { await clearCompletedRequests(); } catch {}
                  }}
                >
                  清空已完成
                </button>
                <button onClick={() => setShowMyRequests(false)} className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-[#f2d4d9] bg-[#fff7f8] hover:border-[#e3001b] hover:bg-[#fff0f1]" aria-label="关闭">
                  <UiImage src="/icons/delete.svg" alt="关闭" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="px-7 py-5 overflow-y-auto flex-1">
              <div className="mb-5 rounded-[12px] border border-[#eaeaea] bg-[#fafafa] px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-bold text-[#222]">本月可用积分</span>
                  <span className="font-mono text-[22px] font-black text-[#e3001b]">{quota?.available ?? "--"}</span>
                  <span className="text-xs text-[#888]">每月 {quota?.total ?? 300} 积分</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#888]">
                  <span>预占 {quota?.reserved ?? "--"}</span>
                  <span>每月1日 重置积分</span>
                </div>
                <div className="mt-3 flex flex-wrap items-baseline gap-2 border-t border-[#eaeaea] pt-3">
                  <span className="text-sm font-bold text-[#222]">本日可用申请</span>
                  <span className="font-mono text-[22px] font-black text-[#e3001b]">{quota?.dailyRemaining ?? "--"}</span>
                  <span className="text-xs text-[#888]">每天 {quota?.dailyTotal ?? 2} 次</span>
                </div>
              </div>

              {myReqLoading ? (
                <div className="text-[#888] text-sm text-center py-10">加载中…</div>
              ) : myRequests.length === 0 ? (
                <div className="text-[#888] text-sm text-center py-10">暂无点播记录</div>
              ) : (
                <div className="space-y-4">
                  {myRequests.map((r) => (
                    <div key={r.id} className="flex gap-4 p-4 border border-[#eaeaea] rounded-[12px] bg-white transition-all hover:border-[#dcdcdc] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:-translate-y-0.5">
                      {r.posterPath ? (
                        <UiImage src={r.posterPath} className="w-[70px] h-[105px] rounded-[8px] object-cover shrink-0" alt={r.title} />
                      ) : (
                        <div className="w-[70px] h-[105px] rounded-[8px] bg-gradient-to-br from-[#e4eaf5] to-[#cbd6e9] shrink-0" />
                      )}
                      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                        <div className="text-[18px] font-bold text-[#222] truncate">{r.title}</div>
                        <div className="text-sm text-[#888]">{r.mediaType === "TV" && r.season ? `第${r.season}季 · ` : ""}{r.year || "-"}</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${
                            r.bizStatus === "COMPLETED"
                              ? "border-green-200 bg-green-50 text-green-700"
                              : r.bizStatus === "PENDING"
                              ? "border-[#d4e6f2] bg-[#f0f8ff] text-[#1e73be]"
                              : r.bizStatus === "NO_RESOURCE"
                              ? "border-red-200 bg-red-50 text-red-600"
                              : r.bizStatus === "CANNOT_UPDATE"
                              ? "border-purple-200 bg-purple-50 text-purple-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}>
                            {r.bizStatus === "COMPLETED" ? "已完成" : r.bizStatus === "PENDING" ? "待处理" : r.bizStatus === "NO_RESOURCE" ? "无资源" : r.bizStatus === "CANNOT_UPDATE" ? "无法更新" : "进行中"}
                          </span>
                        </div>
                        {r.pointCost === 0 ? <div className="text-xs text-green-600">已入库内容 · 免积分点播</div> : r.pointCost ? <div className="text-xs text-[#888]">{r.pointCost} 积分 · {r.pointState === "CHARGED" ? "已扣除" : r.pointState === "RESERVED" && r.pointMonth === quota?.month ? "预占中" : "未扣除"}</div> : <div className="text-xs text-[#888]">历史点播，不计积分</div>}
                        {r.note ? (
                          <div className="w-full min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[12px] text-[#666] bg-[#f8f9fa] border border-[#eaeaea] rounded px-2 py-1">
                            备注：{r.note}
                          </div>
                        ) : null}
                        {r.adminNote ? (
                          <div className="w-full min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[12px] text-[#e3001b] bg-[#fff7f8] border border-[#f3d4d8] rounded px-2 py-1">
                            管理员回复：{r.adminNote}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 self-start">
                        <button
                          className="border border-[#eaeaea] rounded-[8px] px-2.5 py-1 text-[12px] text-[#888] hover:border-[#e3001b] hover:text-[#e3001b] hover:bg-[#fff7f8]"
                          onClick={async () => {
                            try {
                              await deleteMyRequest(r.id);
                            } catch (e) {
                              alert((e as Error)?.message || "删除失败");
                            }
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}

                  {myReqTotalPages > 1 && (
                    <div className="pt-2">
                      <PaginationBar
                        total={myReqTotal}
                        page={myReqPage}
                        totalPages={myReqTotalPages}
                        pageSize={5}
                        onPageChange={loadMyRequests}
                        onPageSizeChange={() => {}}
                        pageSizeOptions={[5]}
                        showPageSize={false}
                        compactSinglePage
                        simpleGoto
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
