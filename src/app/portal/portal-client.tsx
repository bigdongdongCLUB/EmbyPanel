"use client";

import { useEffect, useMemo, useState } from "react";

type Data = {
  dashboard: {
    balanceYuan: number;
    subscriptionEndAt: string | null;
    subscriptionPlan: string;
    remainingDays: number;
  };
  announcements: Array<{ id: string; title: string; content: string }>;
  recentUpdates: Array<{ id: string; title: string; type: "MOVIE" | "TV"; year: string; imageUrl: string | null; serverNames: string[] }>;
  recentUpdatesTv?: Array<{ id: string; title: string; type: "MOVIE" | "TV"; year: string; imageUrl: string | null; serverNames: string[] }>;
  recentUpdatesMovie?: Array<{ id: string; title: string; type: "MOVIE" | "TV"; year: string; imageUrl: string | null; serverNames: string[] }>;
};

function fmtDateYmd(v?: string | null) {
  if (!v) return "--";
  return new Date(v).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export function PortalClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [noticeIndex, setNoticeIndex] = useState(0);

  const notices = useMemo(() => data?.announcements ?? [], [data]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/dashboard", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e: any) {
      setError(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!notices.length) {
      setNoticeIndex(0);
      return;
    }
    setNoticeIndex((i) => (i >= notices.length ? 0 : i));
  }, [notices.length]);

  useEffect(() => {
    if (notices.length <= 1) return;
    const t = window.setInterval(() => {
      setNoticeIndex((i) => (i + 1) % notices.length);
    }, 5000);
    return () => window.clearInterval(t);
  }, [notices.length]);

  const remainingDays = data?.dashboard.remainingDays ?? 0;
  const isExpired = !!data?.dashboard.subscriptionEndAt && new Date(data.dashboard.subscriptionEndAt).getTime() < Date.now();
  const nearExpiry = remainingDays <= 30;

  return (
    <div className="space-y-5">
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="rounded-xl border border-transparent bg-[#f8f9fa] p-6">
          <div className="text-sm text-gray-500">账户余额</div>
          <div className="text-2xl font-bold text-[#222] mt-2">{(data?.dashboard.balanceYuan ?? 0).toFixed(2)} <span className="text-sm font-normal">元</span></div>
        </div>
        <div className="rounded-xl border border-transparent bg-[#f8f9fa] p-6">
          <div className="text-sm text-gray-500">订阅到期日</div>
          <div className="mt-2 flex items-center gap-2">
            <div className={`text-2xl font-bold ${nearExpiry ? "text-[#e3001b]" : "text-[#222]"}`}>{fmtDateYmd(data?.dashboard.subscriptionEndAt)}</div>
            {isExpired ? <div className="inline-flex items-center rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">已过期</div> : null}
          </div>
        </div>
        <div className="rounded-xl border border-transparent bg-[#f8f9fa] p-6">
          <div className="text-sm text-gray-500">订阅计划</div>
          <div className="text-2xl font-bold text-[#222] mt-2">{data?.dashboard.subscriptionPlan ?? "无订阅"}</div>
        </div>
        <div className="relative rounded-xl border p-6 bg-white border-[#e3001b] shadow-[0_8px_24px_rgba(227,0,27,0.08)]">
          {nearExpiry ? <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#e3001b] text-white text-xs px-3 py-1 rounded-full">即将到期</div> : null}
          <div className="text-sm text-gray-500">剩余时间</div>
          <div className="text-2xl font-bold text-[#e3001b] mt-2">{data?.dashboard.remainingDays ?? 0} <span className="text-sm font-normal">天</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="rounded-xl border border-gray-200 bg-white p-7 text-center">
          <div className="text-base font-bold text-[#222] mb-4">系统公告</div>
          <div className="text-[15px] font-semibold text-center">{notices[noticeIndex]?.title ?? "系统公告"}</div>
          <div className="text-sm text-gray-600 mt-2 whitespace-pre-wrap min-h-[56px] text-center leading-6">{notices[noticeIndex]?.content ?? "暂无公告"}</div>
          {notices.length > 1 ? (
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {notices.map((n, i) => (
                <button
                  key={n.id || i}
                  type="button"
                  className={"h-2.5 w-2.5 min-h-0 p-0 rounded-full shrink-0 " + (i === noticeIndex ? "bg-[#e3001b]" : "bg-gray-300")}
                  onClick={() => setNoticeIndex(i)}
                  aria-label={`切换公告 ${i + 1}`}
                  style={{ minHeight: 10 }}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-7 text-center">
          <div className="text-base font-bold text-[#222] mb-2">卡密兑换</div>
          <div className="text-sm text-gray-500 text-center mb-4">输入卡密可快速充值余额或激活订阅。</div>
          <div className="space-y-4">
            <input
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm font-mono bg-[#f4f5f7] text-center outline-none focus:border-[#e3001b] focus:bg-white"
              placeholder="请输入卡密"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            />
            <button
              className="w-full bg-[#e3001b] hover:bg-[#cc0018] text-white rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-50"
              disabled={!redeemCode.trim() || redeeming}
              onClick={async () => {
                setRedeeming(true);
                try {
                  const res = await fetch("/api/portal/redeem", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ code: redeemCode.trim() }),
                  });
                  const json = await res.json().catch(() => null);
                  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                  alert("兑换成功");
                  setRedeemCode("");
                  await refresh();
                } catch (e: any) {
                  alert(`兑换失败: ${e?.message || "unknown"}`);
                } finally {
                  setRedeeming(false);
                }
              }}
            >
              兑换并使用
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        {(() => {
          const tv = data?.recentUpdatesTv ?? data?.recentUpdates?.filter((x) => x.type === "TV") ?? [];
          const movie = data?.recentUpdatesMovie ?? data?.recentUpdates?.filter((x) => x.type === "MOVIE") ?? [];

          if (!tv.length && !movie.length) {
            return <div className="text-sm text-gray-400 py-6 text-center">暂无数据</div>;
          }

          const renderGrid = (items: typeof tv) => (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
              {items.map((it) => (
                <div key={`${it.type}-${it.title}`} className="group cursor-pointer">
                  <div className="relative rounded-lg overflow-hidden aspect-[2/3] bg-gradient-to-br from-[#f5f7fa] to-[#c3cfe2]">
                    {it.imageUrl ? (
                      <img src={it.imageUrl} alt={it.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-500 p-2 text-center">{it.title}</div>
                    )}
                    <div className="absolute top-2 left-2">
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded text-white bg-[#e3001b]">
                        {it.type === "MOVIE" ? "电影" : "电视剧"}
                      </span>
                    </div>
                    {!!it.serverNames?.length && (
                      <div className="absolute bottom-1.5 left-1.5 flex flex-col items-start gap-1 max-w-[92%]">
                        {it.serverNames.slice(0, 2).map((sn) => (
                          <span key={sn} className="inline-flex w-auto max-w-full text-[10px] font-medium px-1.5 py-0.5 rounded border border-white/60 bg-black/40 text-white leading-none whitespace-nowrap">
                            {sn}
                          </span>
                        ))}
                        {it.serverNames.length > 2 ? (
                          <span className="inline-flex w-auto text-[10px] font-medium px-1.5 py-0.5 rounded border border-white/60 bg-black/40 text-white leading-none">...</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-sm font-medium text-[#222] truncate">{it.title}</div>
                  <div className="text-xs text-[#888]">{it.year || "-"}</div>
                </div>
              ))}
            </div>
          );

          return (
            <div className="space-y-7">
              <div>
                <div className="text-lg font-bold text-[#222] mb-4">最近电视剧更新</div>
                {tv.length ? renderGrid(tv.slice(0, 18)) : <div className="text-sm text-[#888]">暂无电视剧更新</div>}
              </div>
              <div>
                <div className="text-lg font-bold text-[#222] mb-4">最近电影更新</div>
                {movie.length ? renderGrid(movie.slice(0, 18)) : <div className="text-sm text-[#888]">暂无电影更新</div>}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
