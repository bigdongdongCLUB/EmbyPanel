"use client";

import { UiImage } from "@/components/ui-image";
import { useEffect, useState } from "react";

type Data = {
  subscription: { planName: string; endAt: string | null; canDeleteExpired?: boolean; serverCount: number; onlineCount: number };
  aggregate: { movieCount: number; seriesCount: number; episodeCount: number; songCount: number };
  servers: Array<{
    id: string;
    name: string;
    online: boolean;
    banned: boolean;
    banTypeLabel?: string | null;
    penaltyUnlockAt?: string | null;
    anomalyDetail?: {
      ips: string[];
      description: string;
      sessions: Array<{ device: string; client: string; ip: string; nowPlaying: string }>;
      detectedAt: string;
    } | null;
    version: string;
    baseUrl: string;
    externalUrl?: string | null;
    backupUrl?: string | null;
    embyUserId: string | null;
    counts: { movieCount: number; seriesCount: number; episodeCount: number; songCount: number };
  }>;
  user: { username: string };
};

type AnomalyDialog = {
  serverName: string;
  detail: NonNullable<Data["servers"][number]["anomalyDetail"]>;
};

function fmtDate(v?: string | null) {
  if (!v) return "--";
  return new Date(v).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function fmtDateTime(v?: string | null) {
  if (!v) return "--";
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function parseBaseUrl(u: string) {
  try {
    const x = new URL(u);
    const protocol = x.protocol.replace(":", "").toUpperCase();
    const port = x.port || (x.protocol === "https:" ? "443" : x.protocol === "http:" ? "80" : "-");
    return { host: x.hostname, port, protocol };
  } catch {
    return { host: u, port: "-", protocol: "-" };
  }
}

export function PortalEmbyServicesClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingServerId, setSyncingServerId] = useState<string | null>(null);
  const [deletingSubscription, setDeletingSubscription] = useState(false);
  const [anomalyDialog, setAnomalyDialog] = useState<AnomalyDialog | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/emby-services", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError((e as Error)?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {anomalyDialog ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="关闭异常监控详情"
            onClick={() => setAnomalyDialog(null)}
          />
          <div className="relative max-h-[86vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-[#eaeaea] bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <button
              type="button"
              className="absolute right-4 top-4 text-xl leading-none text-[#999] hover:text-[#222]"
              aria-label="关闭"
              onClick={() => setAnomalyDialog(null)}
            >
              ×
            </button>
            <div className="pr-8">
              <div className="text-lg font-bold text-[#222]">异常监控</div>
              <div className="mt-1 text-xs text-[#888]">{anomalyDialog.serverName}</div>
            </div>
            <div className="mt-5 space-y-4 text-sm">
              <div>
                <div className="space-y-3 rounded-lg bg-[#f7f8fa] p-3 text-[#333]">
                  <div className="whitespace-pre-wrap leading-6">{anomalyDialog.detail.description || "暂无说明"}</div>
                  {anomalyDialog.detail.sessions.length > 0 ? (
                    <div className="space-y-2">
                      {anomalyDialog.detail.sessions.map((session, index) => (
                        <div key={`${session.device}-${session.client}-${session.ip}-${index}`} className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 leading-6">
                          <div className="font-bold text-[#222]">
                            设备{index + 1}：{session.device || "未知设备"}
                            {session.client ? `（${session.client}）` : ""}
                          </div>
                          <div className="text-[#666]">IP：{session.ip || "-"}</div>
                          <div className="text-[#666]">{session.nowPlaying || "未知内容"}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-bold text-[#888]">检测时间</div>
                <div className="font-mono text-[#333]">{fmtDateTime(anomalyDialog.detail.detectedAt)}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <h1 className="text-2xl font-bold text-[#222]">Emby 服务</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="relative bg-white rounded-2xl border border-[#eaeaea] p-8">
          {data?.subscription.canDeleteExpired ? (
            <button
              className="absolute top-4 right-4 inline-flex items-center justify-center w-8 h-8 rounded-full border border-[#f2d4d9] bg-[#fff7f8] hover:border-[#e3001b] hover:bg-[#fff0f1] disabled:opacity-60"
              disabled={deletingSubscription}
              onClick={async () => {
                const ok = await (window as unknown as { showConfirm: (msg: string) => Promise<boolean> }).showConfirm("该操作会删除用户对应emby服务器上所有资料，且操作不可以逆");
                if (!ok) return;
                setDeletingSubscription(true);
                try {
                  const res = await fetch("/api/portal/emby-services", { method: "DELETE" });
                  const json = (await res.json().catch(() => null)) as { message?: string; error?: string; warn?: boolean } | null;
                  if (!res.ok) {
                    alert(json?.message || json?.error || `HTTP ${res.status}`);
                    return;
                  }
                  if (json?.warn) {
                    alert("订阅计划已删除，但部分服务器删除失败，请联系管理员检查。");
                  } else {
                    alert("订阅计划已删除");
                  }
                  await refresh();
                } finally {
                  setDeletingSubscription(false);
                }
              }}
              title="删除已到期订阅计划"
            >
              <UiImage src="/icons/delete.svg" alt="删除" className="w-3.5 h-3.5" />
            </button>
          ) : null}

          <div className="text-sm text-[#888] mb-4">订阅计划</div>
          <div className="text-[32px] font-bold text-[#222] leading-tight">{data?.subscription.planName ?? "无订阅"}</div>
          <div className="text-sm text-[#888] mt-2 mb-6">有效期至 {fmtDate(data?.subscription.endAt)}</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#f4f5f7] rounded-lg p-4 text-center">
              <div className="text-xs text-[#888]">已分配服务器</div>
              <div className="text-2xl font-bold text-[#222] mt-1">{data?.subscription.serverCount ?? 0}</div>
            </div>
            <div className="bg-[#f4f5f7] rounded-lg p-4 text-center">
              <div className="text-xs text-[#888]">在线服务器</div>
              <div className="text-2xl font-bold text-[#222] mt-1">{data?.subscription.onlineCount ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#eaeaea] p-8">
          <div className="text-sm text-[#888] mb-4">媒体库统计总览</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#f4f5f7] rounded-lg p-5 text-center">
              <div className="text-sm text-[#888] mb-1">🎬 电影</div>
              <div className="text-2xl font-bold text-[#222]">{data?.aggregate.movieCount ?? 0}</div>
            </div>
            <div className="bg-[#f4f5f7] rounded-lg p-5 text-center">
              <div className="text-sm text-[#888] mb-1">📺 电视剧</div>
              <div className="text-2xl font-bold text-[#222]">{data?.aggregate.seriesCount ?? 0}</div>
            </div>
            <div className="bg-[#f4f5f7] rounded-lg p-5 text-center">
              <div className="text-sm text-[#888] mb-1">🎞️ 集数</div>
              <div className="text-2xl font-bold text-[#222]">{data?.aggregate.episodeCount ?? 0}</div>
            </div>
            <div className="bg-[#f4f5f7] rounded-lg p-5 text-center">
              <div className="text-sm text-[#888] mb-1">🎵 音乐</div>
              <div className="text-2xl font-bold text-[#222]">{data?.aggregate.songCount ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {(data?.servers ?? []).map((s) => {
          const visitUrl = (s.baseUrl || "").trim();
          const mainEndpoint = parseBaseUrl(visitUrl);
          const backupEndpoint = s.backupUrl ? parseBaseUrl(String(s.backupUrl)) : null;
          const stateText = s.banned ? (s.banTypeLabel ? `${s.banTypeLabel} 封禁中` : "封禁中") : s.online ? "在线" : "离线";
          const showPenaltyUnlockAt = !!(s.banned && s.banTypeLabel && s.penaltyUnlockAt);
          const canShowAnomalyDetail = !!(s.banned && s.banTypeLabel && s.anomalyDetail);
          return (
            <div key={s.id} className="relative bg-white border-2 border-[#e3001b] rounded-2xl p-8 shadow-[0_8px_24px_rgba(227,0,27,0.08)]">
              {canShowAnomalyDetail ? (
                <button
                  type="button"
                  className="absolute -top-3 left-1/2 inline-flex min-w-max -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#e3001b] px-4 py-1 text-xs font-bold tracking-wide text-white shadow-sm transition hover:bg-[#c90018] focus:outline-none focus:ring-2 focus:ring-[#e3001b]/25"
                  onClick={() => setAnomalyDialog({ serverName: s.name, detail: s.anomalyDetail! })}
                >
                  <span>状态：{stateText}</span>
                  <UiImage src="/icons/exclamation.svg" alt="点击查看详情" className="h-3.5 w-3.5 shrink-0 brightness-0 invert" />
                </button>
              ) : (
                <div className="absolute -top-3 left-1/2 min-w-max -translate-x-1/2 whitespace-nowrap bg-[#e3001b] text-white px-4 py-1 rounded-full text-xs font-bold tracking-wide">状态：{stateText}</div>
              )}
              {showPenaltyUnlockAt ? (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[12px] text-[#666] whitespace-nowrap">
                  解禁时间：{fmtDateTime(s.penaltyUnlockAt)}
                </div>
              ) : null}

              <div className="mb-6">
                <div className="text-[28px] font-bold text-[#222] leading-tight">{s.name}</div>
                <div className="text-sm text-[#888] mt-1">版本：{s.version || "-"}</div>
              </div>

              <div className="mb-6">
                <div className="text-[15px] font-bold text-[#222] mb-2 pb-2 border-b border-[#eaeaea]">节点媒体库统计</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between py-1.5"><span className="text-[#888]">🎬 电影</span><span className="font-medium text-[#222]">{s.counts.movieCount}</span></div>
                  <div className="flex items-center justify-between py-1.5"><span className="text-[#888]">📺 电视剧</span><span className="font-medium text-[#222]">{s.counts.seriesCount}</span></div>
                  <div className="flex items-center justify-between py-1.5"><span className="text-[#888]">🎞️ 集数</span><span className="font-medium text-[#222]">{s.counts.episodeCount}</span></div>
                  <div className="flex items-center justify-between py-1.5"><span className="text-[#888]">🎵 音乐</span><span className="font-medium text-[#222]">{s.counts.songCount}</span></div>
                </div>
              </div>

              <div className="bg-[#f4f5f7] rounded-xl p-5 mb-6 space-y-1.5 text-sm">
                <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">用户名:</span><span className="font-mono text-[15px] text-[#222]">{data?.user.username ?? "-"}</span></div>
                <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">密码:</span><span className="font-mono text-[15px] text-[#222]">当前站点密码</span></div>

                <div className="pt-1">
                  <div className="text-center text-[#8aaec2] text-xs font-semibold tracking-wide mb-1">主线路</div>
                  <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">地址:</span><span className="font-mono text-[15px] text-[#222]">{mainEndpoint.host}</span></div>
                  <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">端口:</span><span className="font-mono text-[15px] text-[#222]">{mainEndpoint.port}</span></div>
                  <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">协议:</span><span className="font-mono text-[15px] text-[#222]">{mainEndpoint.protocol}</span></div>
                </div>

                {backupEndpoint ? (
                  <div className="pt-1">
                    <div className="text-center text-[#8aaec2] text-xs font-semibold tracking-wide mb-1">备用线路</div>
                    <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">地址:</span><span className="font-mono text-[15px] text-[#222]">{backupEndpoint.host}</span></div>
                    <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">端口:</span><span className="font-mono text-[15px] text-[#222]">{backupEndpoint.port}</span></div>
                    <div className="flex py-2"><span className="w-20 text-[#e3001b] font-bold">协议:</span><span className="font-mono text-[15px] text-[#222]">{backupEndpoint.protocol}</span></div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3">
                <button
                  className="w-full text-center bg-white border border-[#e3001b] text-[#e3001b] rounded-lg px-4 py-3 text-base font-bold hover:bg-[#fff0f1] disabled:opacity-60"
                  disabled={!!syncingServerId}
                  onClick={async () => {
                    setSyncingServerId(s.id);
                    try {
                      const res = await fetch("/api/portal/emby-services/sync-password", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ embyServerId: s.id }),
                      });
                      const json = await res.json().catch(() => null);
                      if (!res.ok) {
                        alert(`同步失败: ${json?.error || `HTTP ${res.status}`}`);
                        return;
                      }
                      if ((json?.failedCount ?? 0) > 0) {
                        alert(`已部分同步：成功 ${json?.okCount ?? 0}，失败 ${json?.failedCount ?? 0}`);
                      } else {
                        alert("密码同步成功");
                      }
                    } finally {
                      setSyncingServerId(null);
                    }
                  }}
                >
                  {syncingServerId === s.id ? "同步中..." : "同步面板和Emby密码"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
