"use client";

import { useCallback, useEffect, useState } from "react";
import { PaginationBar } from "@/components/pagination-bar";

type MediaItem = {
  id: number;
  title: string;
  titleOriginal: string;
  posterPath: string | null;
  year: string;
  rating: number | null;
  mediaType: "movie" | "tv";
};

type Season = { seasonNumber: number; name: string; episodeCount: number };

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
  totalRemaining: number;
  totalTotal: number;
  movieRemaining: number;
  movieTotal: number;
  tvRemaining: number;
  tvTotal: number;
  resetPeriod: string;
  nextReset: string;
};

type Tab = "now_playing_movie" | "now_playing_tv" | "popular_movie" | "popular_tv";
const MAX_DISCOVER_PAGES = 10;

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "now_playing_movie", label: "最新电影", icon: "🎬" },
  { key: "now_playing_tv", label: "最新电视剧", icon: "📺" },
  { key: "popular_movie", label: "热门电影", icon: "🔥" },
  { key: "popular_tv", label: "热门电视剧", icon: "🔥" },
];

function PosterCard({ item, inLibrary, onClick }: { item: MediaItem; inLibrary: boolean; onClick: () => void }) {
  return (
    <div className="cursor-pointer group" onClick={onClick}>
      <div className="relative rounded-lg overflow-hidden aspect-[2/3] bg-gradient-to-br from-[#e4eaf5] to-[#cbd6e9] border-2 border-transparent transition-all duration-300 group-hover:border-[#e3001b] group-hover:shadow-[0_8px_24px_rgba(227,0,27,0.15)] group-hover:-translate-y-1">
        {item.posterPath ? (
          <img src={item.posterPath} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs p-2 text-center">{item.title}</div>
        )}
        <div className="absolute top-1.5 left-1.5">
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded text-white bg-[#e3001b] shadow">
            {item.mediaType === "movie" ? "电影" : "剧集"}
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
        <div className="text-xs text-[#888]">{item.year}</div>
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
  onSubmit: (params: { season?: number; note: string }) => Promise<void>;
  vodEnabled: boolean;
  vodCanRequest: boolean;
  vodDisabledReason: string;
}) {
  const [selectedSeason, setSelectedSeason] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSeason("");
    setNote("");
    setSubmitError(null);
  }, [detail]);

  if (!detail || !item) return null;
  const { detail: d, serverResults } = detail;
  const isTv = d.mediaType === "tv";
  const seasons = d.seasons ?? [];

  const allSeasonsExist =
    isTv && seasons.length > 0 && serverResults.length > 0 && seasons.every((s) => serverResults.some((sr) => sr.seasons[s.seasonNumber]));
  const movieExists = !isTv && serverResults.some((sr) => sr.hasMovie);
  const allExist = isTv ? allSeasonsExist : movieExists;

  const overview = d.overview.length > 100 ? d.overview.slice(0, 100) + "…" : d.overview;
  const canSubmit = vodEnabled && vodCanRequest && (!isTv || selectedSeason !== "") && !submitting;

  const serverTableSeasons = seasons;

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit({ season: isTv && selectedSeason !== "" ? Number(selectedSeason) : undefined, note });
      onClose();
    } catch (e: any) {
      setSubmitError(e?.message ?? "提交失败");
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
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>

          {allExist && (
            <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 mb-4">
              <span className="text-green-500 text-lg mt-0.5 shrink-0">✓</span>
              <div>
                <div className="font-medium text-green-800 text-sm">{isTv ? "所有季度已存在或已点播" : "该电影已存在于媒体库"}</div>
                <div className="text-xs text-green-700 mt-0.5">{isTv ? "所有季度均已上线或已被点播，无需再次点播。" : "该电影已上线，无需再次点播。"}</div>
              </div>
            </div>
          )}

          <div className="flex gap-3 mb-4">
            {d.posterPath ? (
              <img src={d.posterPath} alt={d.title} className="w-20 h-28 rounded-lg object-cover shrink-0" />
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

          {!allExist && (
            <div className="flex gap-2 rounded-xl border border-[#f3d4d8] bg-[#fff7f8] px-4 py-3 mb-4">
              <span className="text-blue-500 shrink-0 mt-0.5 text-sm">ℹ</span>
              <div className="text-sm text-gray-700">
                <div className="font-medium text-gray-800 mb-0.5">点播说明</div>
                提交请求后，管理员将审核您的请求。通过审核后，内容将会被添加到服务器中。请注意您的点播配额限制。
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
                    第 {s.seasonNumber} 季 ({s.episodeCount} 集)
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
              maxLength={20}
              placeholder="可填写简短备注（最多20字）"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 20))}
            />
            <div className="text-right text-xs text-gray-400">{note.length} / 20</div>
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
  const [inLibrarySet, setInLibrarySet] = useState<Set<number>>(new Set());
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
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [myReqPage, setMyReqPage] = useState(1);
  const [myReqTotalPages, setMyReqTotalPages] = useState(1);
  const [myReqTotal, setMyReqTotal] = useState(0);
  const [myReqLoading, setMyReqLoading] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [vodEnabled, setVodEnabled] = useState(true);
  const [vodCanRequest, setVodCanRequest] = useState(true);
  const [vodDisabledReason, setVodDisabledReason] = useState("目前点播功能暂未开启");

  const checkLibrary = useCallback(async (list: MediaItem[]) => {
    if (!list.length) return;
    setInLibrarySet(new Set()); // reset while checking
    try {
      const r = await fetch("/api/portal/vod/check-library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: list.map((i) => ({ id: i.id, title: i.title, titleOriginal: i.titleOriginal, year: i.year, mediaType: i.mediaType })),
        }),
      });
      const j = await r.json();
      if (j?.inLibrary) setInLibrarySet(new Set(j.inLibrary as number[]));
    } catch {
      // non-critical, ignore
    }
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
      if (j?.ok) setSelectedDetail(j);
    } finally { setDetailLoading(false); }
  }

  async function loadMyRequests(page = 1) {
    setMyReqLoading(true);
    try {
      const r = await fetch(`/api/portal/vod/request?page=${page}&pageSize=10`, { cache: "no-store" });
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
    const ok = await (window as any).showConfirm("确认清空所有已完成点播记录？");
    if (!ok) return;
    const r = await fetch("/api/portal/vod/request", { method: "DELETE" });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    await Promise.all([loadMyRequests(1), loadVodQuota()]);
  }

  async function submitRequest({ season, note }: { season?: number; note: string }) {
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
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
    await loadVodQuota();
    alert("点播请求已提交！");
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
      <div className="flex border-b border-[#eaeaea] overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`flex items-center gap-1.5 px-4 py-3 text-[15px] whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeTab === tab.key && !searchQuery ? "border-[#e3001b] text-[#e3001b] font-bold" : "border-transparent text-[#888] hover:text-[#222]"
            }`}
            onClick={() => { setActiveTab(tab.key); clearSearch(); setCurrentPage(1); }}
          >
            <span>{tab.icon}</span>{tab.label}
          </button>
        ))}
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
              <PosterCard key={`${item.mediaType}-${item.id}`} item={item} inLibrary={inLibrarySet.has(item.id)} onClick={() => openDetail(item)} />
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

      {/* My requests */}
      {showMyRequests && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMyRequests(false)} />
          <div className="relative bg-white w-full max-w-[560px] max-h-[85vh] rounded-[20px] border-2 border-[#e3001b] shadow-[0_12px_32px_rgba(227,0,27,0.10)] flex flex-col overflow-hidden">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#e3001b] text-white px-4 py-1 rounded-[14px] text-[13px] font-bold tracking-[1px] z-10">点播记录</div>

            <div className="px-7 py-5 border-b border-[#eaeaea] flex items-center justify-between">
              <div className="text-[20px] font-bold text-[#222]">我的点播记录</div>
              <div className="flex items-center gap-4">
                <button
                  className="border border-[#eaeaea] rounded-[8px] px-4 py-1.5 text-[13px] text-[#222] hover:border-[#e3001b] hover:text-[#e3001b] hover:bg-[#fff0f1] disabled:opacity-40"
                  disabled={myReqLoading}
                  onClick={async () => {
                    try { await clearCompletedRequests(); } catch {}
                  }}
                >
                  清空已完成
                </button>
                <button onClick={() => setShowMyRequests(false)} className="text-[#888] hover:text-[#e3001b] text-2xl leading-none">×</button>
              </div>
            </div>

            <div className="px-7 py-5 overflow-y-auto flex-1">
              <div className="bg-[#fafafa] border border-[#eaeaea] rounded-[12px] px-4 py-3 flex items-center justify-between mb-5">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-[#222]">今日点播配额</span>
                  <span className="text-[18px] font-black text-[#e3001b] font-mono">{quota ? `${quota.totalRemaining}/${quota.totalTotal}` : "--/--"}</span>
                </div>
                <span className="text-xs text-[#888]">（默认每人每天 {quota?.totalTotal ?? 5} 个额度）</span>
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
                        <img src={r.posterPath} className="w-[70px] h-[105px] rounded-[8px] object-cover shrink-0" alt={r.title} />
                      ) : (
                        <div className="w-[70px] h-[105px] rounded-[8px] bg-gradient-to-br from-[#e4eaf5] to-[#cbd6e9] shrink-0" />
                      )}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="text-[18px] font-bold text-[#222] truncate">{r.title}</div>
                        <div className="text-sm text-[#888] mt-1">{r.mediaType === "TV" && r.season ? `第${r.season}季 · ` : ""}{r.year || "-"}</div>
                        <div className="mt-2">
                          <span className={`inline-flex items-center px-3 py-1 rounded-[6px] text-[13px] font-bold ${
                            r.bizStatus === "COMPLETED"
                              ? "bg-[#f0f0f0] text-[#888]"
                              : "bg-[#fff0f1] text-[#e3001b]"
                          }`}>
                            {r.bizStatus === "COMPLETED" ? "已完成" : r.bizStatus === "PENDING" ? "待处理" : r.bizStatus === "NO_RESOURCE" ? "无资源" : r.bizStatus === "CANNOT_UPDATE" ? "无法更新" : "进行中"}
                          </span>
                        </div>
                        {r.adminNote ? (
                          <div className="text-[12px] text-[#888] mt-2 truncate">管理员回复：{String(r.adminNote).slice(0, 30)}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {myReqTotalPages > 1 && (
                    <div className="pt-2">
                      <PaginationBar
                        total={myReqTotal}
                        page={myReqPage}
                        totalPages={myReqTotalPages}
                        pageSize={10}
                        onPageChange={loadMyRequests}
                        onPageSizeChange={() => {}}
                        pageSizeOptions={[10]}
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
