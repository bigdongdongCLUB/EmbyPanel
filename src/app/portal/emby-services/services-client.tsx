"use client";

import { useEffect, useState } from "react";

type Data = {
  subscription: { planName: string; endAt: string | null; serverCount: number; onlineCount: number };
  aggregate: { movieCount: number; seriesCount: number; episodeCount: number; songCount: number };
  servers: Array<{
    id: string;
    name: string;
    online: boolean;
    banned: boolean;
    version: string;
    baseUrl: string;
    externalUrl?: string | null;
    embyUserId: string | null;
    counts: { movieCount: number; seriesCount: number; episodeCount: number; songCount: number };
  }>;
  user: { username: string };
};

function fmtDate(v?: string | null) {
  if (!v) return "--";
  return new Date(v).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
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

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/emby-services", { cache: "no-store" });
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

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <h1 className="text-2xl font-bold text-[#222]">Emby 服务</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-[#eaeaea] p-8">
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
          const visitUrl = (s.externalUrl || s.baseUrl || "").trim();
          const endpoint = parseBaseUrl(visitUrl || s.baseUrl);
          const stateText = s.banned ? "封禁中" : s.online ? "在线" : "离线";
          return (
            <div key={s.id} className="relative bg-white border-2 border-[#e3001b] rounded-2xl p-8 shadow-[0_8px_24px_rgba(227,0,27,0.08)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#e3001b] text-white px-4 py-1 rounded-full text-xs font-bold tracking-wide">状态：{stateText}</div>

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
                <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">地址:</span><span className="font-mono text-[15px] text-[#222]">{endpoint.host}</span></div>
                <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">端口:</span><span className="font-mono text-[15px] text-[#222]">{endpoint.port}</span></div>
                <div className="flex py-2"><span className="w-20 text-[#e3001b] font-bold">协议:</span><span className="font-mono text-[15px] text-[#222]">{endpoint.protocol}</span></div>
              </div>

              <div className="flex flex-col gap-3">
                <a href={visitUrl || s.baseUrl} target="_blank" rel="noreferrer" className="w-full text-center bg-[#e3001b] hover:bg-[#c20017] text-white rounded-lg px-4 py-3 text-base font-bold">
                  访问服务器
                </a>
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
