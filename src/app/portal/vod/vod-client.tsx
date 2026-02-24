"use client";

import { useCallback, useEffect, useState } from "react";

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
  movieRemaining: number;
  movieTotal: number;
  tvRemaining: number;
  tvTotal: number;
  resetPeriod: string;
  nextReset: string;
};

type Tab = "now_playing_movie" | "now_playing_tv" | "popular_movie" | "popular_tv";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "now_playing_movie", label: "最新电影", icon: "🎬" },
  { key: "now_playing_tv", label: "最新电视剧", icon: "📺" },
  { key: "popular_movie", label: "热门电影", icon: "🔥" },
  { key: "popular_tv", label: "热门电视剧", icon: "🔥" },
];

function PosterCard({ item, inLibrary, onClick }: { item: MediaItem; inLibrary: boolean; onClick: () => void }) {
  return (
    <div className="cursor-pointer group" onClick={onClick}>
      <div className="relative rounded-xl overflow-hidden aspect-[2/3] bg-gray-100 shadow-sm">
        {item.posterPath ? (
          <img src={item.posterPath} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs p-2 text-center">{item.title}</div>
        )}
        <div className="absolute top-1.5 left-1.5">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded text-white shadow ${item.mediaType === "movie" ? "bg-blue-500" : "bg-purple-500"}`}>
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
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-green-400 bg-green-50 text-green-700 shadow-sm">
              已入库
            </span>
          </div>
        )}
      </div>
      <div className="mt-1.5 px-0.5">
        <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
        <div className="text-xs text-gray-400">{item.year}</div>
      </div>
    </div>
  );
}

function DetailModal({
  item,
  detail,
  onClose,
  onSubmit,
}: {
  item: MediaItem | null;
  detail: DetailData | null;
  onClose: () => void;
  onSubmit: (params: { season?: number; note: string }) => Promise<void>;
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
  const canSubmit = (!isTv || selectedSeason !== "") && !submitting;

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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto overscroll-contain">
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
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isTv ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
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
            <div className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 mb-4">
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
                className="w-full border rounded-lg px-3 py-2 text-sm"
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
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              rows={3}
              maxLength={500}
              placeholder="您可以添加备注信息，如特定的版本要求、字幕语言等..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="text-right text-xs text-gray-400">{note.length} / 500</div>
          </div>

          {submitError && <div className="text-sm text-red-600 mb-3">{submitError}</div>}

          <div className="flex justify-end gap-2">
            <button className="px-4 py-2 rounded-lg border bg-white text-gray-700 text-sm hover:bg-gray-50" onClick={onClose}>取消</button>
            <button
              className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-800 disabled:opacity-50"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {submitting ? "提交中…" : "提交申请"}
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
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showMyRequests, setShowMyRequests] = useState(false);
  const [myRequests, setMyRequests] = useState<any[]>([]);

  const checkLibrary = useCallback(async (list: MediaItem[]) => {
    if (!list.length) return;
    setInLibrarySet(new Set()); // reset while checking
    try {
      const r = await fetch("/api/portal/vod/check-library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: list.map((i) => ({ id: i.id, title: i.title, titleOriginal: i.titleOriginal, mediaType: i.mediaType })),
        }),
      });
      const j = await r.json();
      if (j?.inLibrary) setInLibrarySet(new Set(j.inLibrary as number[]));
    } catch {
      // non-critical, ignore
    }
  }, []);

  const loadTab = useCallback(async (tab: Tab) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/vod/discover?category=${tab}&page=1`);
      const j = await r.json();
      const results = j?.results ?? [];
      setItems(results);
      checkLibrary(results);
    } finally { setLoading(false); }
  }, [checkLibrary]);

  useEffect(() => { if (!searchQuery) loadTab(activeTab); }, [activeTab, searchQuery, loadTab]);

  async function doSearch(q: string) {
    if (!q.trim()) { setSearchQuery(""); setSearchTotal(null); return; }
    setSearchQuery(q);
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/vod/search?q=${encodeURIComponent(q)}&page=1`);
      const j = await r.json();
      const results = j?.results ?? [];
      setItems(results);
      setSearchTotal(j?.totalResults ?? 0);
      checkLibrary(results);
    } finally { setLoading(false); }
  }

  function clearSearch() {
    setSearchInput("");
    setSearchQuery("");
    setSearchTotal(null);
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

  async function submitRequest({ season, note }: { season?: number; note: string }) {
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
    alert("点播请求已提交！");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold text-gray-800">点播功能</div>
        <button
          className="flex items-center gap-1.5 border rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 shrink-0"
          onClick={async () => {
            const r = await fetch("/api/portal/vod/request");
            const j = await r.json();
            setMyRequests(j?.rows ?? []);
            setShowMyRequests(true);
          }}
        >
          🕐 我的点播
        </button>
      </div>

      {/* Search */}
      <div className="bg-white border rounded-xl p-4 space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 flex items-center border rounded-lg px-3 py-2 gap-2 focus-within:border-blue-400">
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
          <button className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shrink-0" onClick={() => doSearch(searchInput)}>
            搜索
          </button>
          {searchQuery && (
            <button className="px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 shrink-0" onClick={clearSearch}>清除</button>
          )}
        </div>
        {searchTotal !== null && (
          <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <span className="text-sm">ℹ</span>
            <span>搜索结果：{searchTotal} 条</span>
            <button className="ml-auto text-gray-400 hover:text-gray-600" onClick={clearSearch}>✕</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeTab === tab.key && !searchQuery ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => { setActiveTab(tab.key); clearSearch(); }}
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
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {items.map((item) => (
            <PosterCard key={`${item.mediaType}-${item.id}`} item={item} inLibrary={inLibrarySet.has(item.id)} onClick={() => openDetail(item)} />
          ))}
          {items.length === 0 && (
            <div className="col-span-6 py-16 text-center text-gray-400 text-sm">暂无内容</div>
          )}
        </div>
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
        />
      )}

      {/* My requests */}
      {showMyRequests && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMyRequests(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-gray-800">我的点播记录</div>
              <button onClick={() => setShowMyRequests(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            {myRequests.length === 0 ? (
              <div className="text-gray-400 text-sm text-center py-10">暂无点播记录</div>
            ) : (
              <div className="space-y-2">
                {myRequests.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 border rounded-xl">
                    {r.posterPath ? (
                      <img src={r.posterPath} className="w-10 h-14 rounded object-cover shrink-0" alt={r.title} />
                    ) : (
                      <div className="w-10 h-14 bg-gray-100 rounded shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{r.title}</div>
                      <div className="text-xs text-gray-400">
                        {r.mediaType === "TV" && r.season ? `第${r.season}季 · ` : ""}{r.year}
                      </div>
                      <div className="text-xs mt-0.5">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          r.status === "APPROVED" ? "bg-green-50 text-green-700" :
                          r.status === "REJECTED" ? "bg-red-50 text-red-600" :
                          r.status === "CANCELLED" ? "bg-gray-100 text-gray-500" :
                          "bg-amber-50 text-amber-700"
                        }`}>
                          {r.status === "APPROVED" ? "已通过" : r.status === "REJECTED" ? "已拒绝" : r.status === "CANCELLED" ? "已取消" : "待审核"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
