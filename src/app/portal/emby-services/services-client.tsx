"use client";

import { useEffect, useState } from "react";

type Data = {
  subscription: { planName: string; endAt: string | null; serverCount: number; onlineCount: number };
  aggregate: { movieCount: number; seriesCount: number; episodeCount: number; songCount: number };
  servers: Array<{
    id: string;
    name: string;
    online: boolean;
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

function hostFromUrl(u: string) {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

export function PortalEmbyServicesClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            <div className="border rounded p-4 text-center"><div className="text-sm text-gray-500">电影</div><div className="text-2xl font-semibold mt-1">{data?.aggregate.movieCount ?? 0}</div></div>
            <div className="border rounded p-4 text-center"><div className="text-sm text-gray-500">电视剧</div><div className="text-2xl font-semibold mt-1">{data?.aggregate.seriesCount ?? 0}</div></div>
            <div className="border rounded p-4 text-center"><div className="text-sm text-gray-500">集数</div><div className="text-2xl font-semibold mt-1">{data?.aggregate.episodeCount ?? 0}</div></div>
            <div className="border rounded p-4 text-center"><div className="text-sm text-gray-500">音乐</div><div className="text-2xl font-semibold mt-1">{data?.aggregate.songCount ?? 0}</div></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {(data?.servers ?? []).map((s) => (
          <div key={s.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-semibold">{s.name}</div>
              <span className={"text-xs px-2 py-1 rounded border " + (s.online ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200")}>{s.online ? "在线" : "离线"}</span>
            </div>

            <div className="text-sm text-gray-600">版本：{s.version || "-"}</div>
            <div className="border rounded p-3 bg-blue-50/40 text-sm space-y-1">
              <div>用户名：{data?.user.username ?? "-"}</div>
              <div>地址：{hostFromUrl(s.baseUrl)}</div>
              <div>协议：{String(s.baseUrl).startsWith("https") ? "HTTPS" : "HTTP"}</div>
            </div>

            <div className="flex gap-2">
              <a href={s.baseUrl} target="_blank" rel="noreferrer" className="flex-1 text-center bg-blue-600 text-white rounded px-3 py-2">访问服务器</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
