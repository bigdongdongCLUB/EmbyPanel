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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Emby 服务</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="border rounded-lg p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="text-sm text-gray-500">订阅计划</div>
          <div className="border rounded-lg p-4">
            <div className="text-3xl font-semibold">{data?.subscription.planName ?? "无订阅"}</div>
            <div className="text-sm text-gray-600 mt-2">有效期至 {fmtDate(data?.subscription.endAt)}</div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="border rounded p-3 text-center">
                <div className="text-xs text-gray-500">已分配服务器</div>
                <div className="text-2xl font-semibold mt-1">{data?.subscription.serverCount ?? 0}</div>
              </div>
              <div className="border rounded p-3 text-center">
                <div className="text-xs text-gray-500">在线服务器</div>
                <div className="text-2xl font-semibold mt-1">{data?.subscription.onlineCount ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm text-gray-500">媒体库统计</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded p-4 text-center"><div className="text-sm text-gray-500">🎬 电影</div><div className="text-2xl font-semibold mt-1">{data?.aggregate.movieCount ?? 0}</div></div>
            <div className="border rounded p-4 text-center"><div className="text-sm text-gray-500">📺 电视剧</div><div className="text-2xl font-semibold mt-1">{data?.aggregate.seriesCount ?? 0}</div></div>
            <div className="border rounded p-4 text-center"><div className="text-sm text-gray-500">🎞️ 集数</div><div className="text-2xl font-semibold mt-1">{data?.aggregate.episodeCount ?? 0}</div></div>
            <div className="border rounded p-4 text-center"><div className="text-sm text-gray-500">🎵 音乐</div><div className="text-2xl font-semibold mt-1">{data?.aggregate.songCount ?? 0}</div></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {(data?.servers ?? []).map((s) => {
          const endpoint = parseBaseUrl(s.baseUrl);
          return (
            <div key={s.id} className="border rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-3xl font-semibold">{s.name}</div>
                  <div className="text-sm text-gray-600 mt-1">版本：{s.version || "-"}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={"text-xs px-3 py-1 rounded-full border " + (s.online ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200")}>{s.online ? "在线" : "离线"}</span>
                  {s.banned ? <span className="text-xs px-3 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">封禁中</span> : null}
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 border p-3">
                <div className="font-medium mb-2">媒体库统计</div>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div>🎬 电影</div><div className="text-right font-semibold">{s.counts.movieCount}</div>
                  <div>📺 电视剧</div><div className="text-right font-semibold">{s.counts.seriesCount}</div>
                  <div>🎞️ 集数</div><div className="text-right font-semibold">{s.counts.episodeCount}</div>
                  <div>🎵 音乐</div><div className="text-right font-semibold">{s.counts.songCount}</div>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50/60 border p-3 text-sm space-y-2">
                <div><span className="font-semibold text-blue-700">用户名：</span> {data?.user.username ?? "-"}</div>
                <div><span className="font-semibold text-blue-700">密码：</span> 当前站点密码</div>

                <div className="my-1 border-t border-dashed" />

                <div><span className="font-semibold text-blue-700">地址：</span> {endpoint.host}</div>
                <div><span className="font-semibold text-blue-700">端口：</span> {endpoint.port}</div>
                <div><span className="font-semibold text-blue-700">协议：</span> {endpoint.protocol}</div>
              </div>

              <div className="flex flex-col gap-2">
                <a href={s.baseUrl} target="_blank" rel="noreferrer" className="w-full text-center bg-blue-600 text-white rounded px-3 py-2">访问服务器</a>
                <button
                  className="w-full text-center border border-orange-300 text-red-600 rounded px-3 py-2 bg-white hover:bg-orange-50 disabled:opacity-60"
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
