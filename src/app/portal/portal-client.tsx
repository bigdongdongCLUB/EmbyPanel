"use client";

import { UiImage } from "@/components/ui-image";
import { renderMarkdownLite } from "@/lib/markdown-lite";
import { useEffect, useMemo, useState } from "react";

type Data = {
  profile: {
    email: string | null;
    role: string;
  };
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

function redeemErrorMessage(message: string) {
  if (["card_not_found", "card_not_usable", "card_already_used", "invalid_payload"].includes(message)) {
    return "兑换失败 卡密错误";
  }
  return `兑换失败: ${message || "unknown"}`;
}

export function PortalClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [noticeIndex, setNoticeIndex] = useState(0);
  const [emailReminderOpen, setEmailReminderOpen] = useState(false);
  const [emailReminderHandled, setEmailReminderHandled] = useState(false);

  const initialLoading = loading && data === null;
  const notices = useMemo(() => data?.announcements ?? [], [data]);
  const currentNoticeHtml = useMemo(() => renderMarkdownLite(notices[noticeIndex]?.content ?? "暂无公告"), [notices, noticeIndex]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/dashboard", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "load_failed");
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

  useEffect(() => {
    if (!redeeming) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [redeeming]);

  useEffect(() => {
    if (!initialLoading) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [initialLoading]);

  useEffect(() => {
    if (loading || !data || emailReminderHandled) return;
    const isRegularUser = data.profile.role === "USER";
    const hasEmail = !!String(data.profile.email || "").trim();
    if (isRegularUser && !hasEmail) {
      setEmailReminderOpen(true);
      setEmailReminderHandled(true);
    }
  }, [data, emailReminderHandled, loading]);

  const remainingDays = data?.dashboard.remainingDays ?? 0;
  const isExpired = !!data?.dashboard.subscriptionEndAt && new Date(data.dashboard.subscriptionEndAt).getTime() < Date.now();
  const isDue = remainingDays <= 0;
  const nearExpiry = remainingDays <= 30;
  const metricCardClass = "min-w-0 rounded-2xl border border-transparent bg-[#f8f9fa] p-4 sm:p-6 min-h-[116px] sm:min-h-[132px] flex flex-col justify-center";
  const metricLabelClass = "text-sm text-gray-500";
  const metricValueClass = "min-w-0 text-[clamp(1.25rem,5.6vw,1.5rem)] sm:text-2xl font-bold leading-tight";

  return (
    <div className="space-y-5">
      {initialLoading ? (
        <div
          className="fixed inset-0 z-[100] flex touch-none select-none items-center justify-center bg-white/35 px-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="数据加载中"
        >
          <div className="w-full max-w-[280px] rounded-2xl border border-white/80 bg-white/95 px-7 py-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
            <div className="relative mx-auto h-12 w-12">
              <div className="absolute inset-0 rounded-full border-4 border-[#f2d8dc]" />
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#e3001b]" />
            </div>
            <div className="mt-5 text-lg font-bold text-[#222]">数据加载中</div>
            <div className="mt-2 text-sm text-[#888]">正在获取您的账户与订阅信息，请稍候。</div>
          </div>
        </div>
      ) : null}

      {redeeming ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-xs rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-xl">
            <div className="mx-auto h-9 w-9 rounded-full border-4 border-gray-200 border-t-[#e3001b] animate-spin" />
            <div className="mt-4 text-base font-semibold text-[#222]">进行中...</div>
            <div className="mt-1 text-xs text-gray-500">正在兑换卡密，请稍候，不要刷新或离开页面。</div>
          </div>
        </div>
      ) : null}

      {emailReminderOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 px-4" role="dialog" aria-modal="true" aria-label="邮箱设置提醒">
          <div className="w-full max-w-[420px] rounded-2xl border border-[#f3d5d9] bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
            <div className="text-lg font-bold text-[#222]">邮箱设置提醒</div>
            <div className="mt-3 text-sm leading-6 text-[#555]">
              请在个人资料中设置邮箱，以便密码丢失后找回密码
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-2 text-sm text-[#555] hover:border-[#d1d5db] hover:bg-[#f9fafb]"
                onClick={() => setEmailReminderOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#e3001b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c20017]"
                onClick={() => {
                  setEmailReminderOpen(false);
                  window.dispatchEvent(new Event("portal:open-profile"));
                }}
              >
                个人资料
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading && data ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
        <div className={metricCardClass}>
          <div className={metricLabelClass}>账户余额</div>
          <div className={`${metricValueClass} mt-2 text-[#222] whitespace-nowrap`}>
            {(data?.dashboard.balanceYuan ?? 0).toFixed(2)} <span className="text-sm font-normal">元</span>
          </div>
        </div>
        <div className={metricCardClass}>
          <div className={metricLabelClass}>订阅到期日</div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <div className={`${metricValueClass} whitespace-nowrap ${nearExpiry ? "text-[#e3001b]" : "text-[#222]"}`}>{fmtDateYmd(data?.dashboard.subscriptionEndAt)}</div>
            {isExpired ? <div className="inline-flex items-center rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">已过期</div> : null}
          </div>
        </div>
        <div className={metricCardClass}>
          <div className={metricLabelClass}>订阅计划</div>
          <div className={`${metricValueClass} mt-2 text-[#222] break-words [overflow-wrap:anywhere]`}>{data?.dashboard.subscriptionPlan ?? "无订阅"}</div>
        </div>
        <div className="relative flex min-h-[116px] min-w-0 flex-col justify-center rounded-2xl border border-[#e3001b] bg-white p-4 shadow-[0_8px_24px_rgba(227,0,27,0.08)] sm:min-h-[132px] sm:p-6">
          {nearExpiry ? <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#e3001b] text-white text-xs px-3 py-1 rounded-full">{isDue ? "到期" : "即将到期"}</div> : null}
          <div className={metricLabelClass}>剩余时间</div>
          <div className={`${metricValueClass} mt-2 text-[#e3001b] break-words [overflow-wrap:anywhere]`}>
            {data?.dashboard.remainingDays ?? 0} <span className="text-sm font-normal">天</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-7 text-center">
          <div className="text-base font-bold text-[#222] mb-4">系统公告</div>
          {notices[noticeIndex]?.title ? <div className="text-[15px] font-semibold text-center">{notices[noticeIndex]?.title}</div> : null}
          <div
            className="docs-content announcement-content text-sm text-gray-600 mt-2 min-h-[56px] max-h-[220px] overflow-y-auto pr-1 leading-6 text-left"
            dangerouslySetInnerHTML={{ __html: currentNoticeHtml }}
          />
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

        <div className="rounded-2xl border border-gray-200 bg-white p-7 text-center">
          <div className="text-base font-bold text-[#222] mb-2">卡密兑换</div>
          <div className="text-sm text-gray-500 text-center mb-4">输入卡密可快速充值余额或激活订阅。</div>
          <div className="space-y-4">
            <input
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm font-mono bg-[#f4f5f7] text-center outline-none focus:border-[#e3001b] focus:bg-white"
              placeholder="请输入卡密"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
              disabled={redeeming}
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
                } catch (e: unknown) {
                  alert(redeemErrorMessage(e instanceof Error ? e.message : "unknown"));
                } finally {
                  setRedeeming(false);
                }
              }}
            >
              {redeeming ? "兑换中..." : "兑换并使用"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
        {(() => {
          const tv = data?.recentUpdatesTv ?? data?.recentUpdates?.filter((x) => x.type === "TV") ?? [];
          const movie = data?.recentUpdatesMovie ?? data?.recentUpdates?.filter((x) => x.type === "MOVIE") ?? [];

          if (!tv.length && !movie.length) {
            return <div className="text-sm text-gray-400 py-6 text-center">暂无数据</div>;
          }

          const renderGrid = (items: typeof tv) => (
            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
              {items.map((it) => (
                <div key={`${it.type}-${it.title}`} className="group cursor-pointer">
                  <div className="relative rounded-lg overflow-hidden aspect-[2/3] bg-gradient-to-br from-[#f5f7fa] to-[#c3cfe2]">
                    {it.imageUrl ? (
                      <UiImage src={it.imageUrl} alt={it.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-500 p-2 text-center">{it.title}</div>
                    )}
                    <div className="absolute top-2 left-2">
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded text-white ${it.type === "MOVIE" ? "bg-[#913edb]" : "bg-[#e3001b]"}`}>
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
