"use client";

import { useEffect, useMemo, useState } from "react";

type ServerOption = { id: string; name: string; enabled: boolean };

type SessionRow = {
  id: string;
  userName: string;
  device: string;
  client: string;
  ip: string;
  paused: boolean;
  nowPlaying: string;
};

type Data = {
  ok: boolean;
  server: { id: string; name: string; baseUrl: string; version?: string | null };
  online: boolean;
  latencyMs: number;
  playingCount: number;
  sessions: SessionRow[];
  warn?: any;
  error?: string;
};

export function RealtimeMonitorClient() {
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [serverId, setServerId] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalSec = 120;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);

  async function loadServers() {
    const res = await fetch("/api/admin/emby-servers", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
    const list = (json.servers ?? []).filter((s: any) => s.enabled);
    setServers(list);
    if (!serverId && list.length) setServerId(list[0].id);
  }

  async function refresh() {
    if (!serverId) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL(window.location.origin + "/api/admin/monitoring/realtime");
      url.searchParams.set("serverId", serverId);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServers().catch((e) => setError(e?.message ?? "load_servers_failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => refresh(), intervalSec * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, serverId]);

  const onlineLabel = useMemo(() => {
    if (!data) return "-";
    if (!data.online) return "离线";
    return `在线（${data.latencyMs}ms）`;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select className="border rounded px-3 py-2" value={serverId} onChange={(e) => setServerId(e.target.value)}>
          <option value="">选择服务器…</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button className="border rounded px-3 py-2" onClick={refresh} disabled={loading || !serverId}>
          刷新
        </button>

        <label className="flex items-center gap-2 text-sm text-gray-700 ml-2">
          自动刷新（{intervalSec}秒）
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
        </label>

        {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">服务器状态</div>
          <div className="mt-2 text-2xl font-semibold">{onlineLabel}</div>
          <div className="mt-1 text-xs text-gray-500">{data?.server?.version ? `Emby ${data.server.version}` : ""}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">正在播放</div>
          <div className="mt-2 text-2xl font-semibold">{data ? data.playingCount : "-"}</div>
          <div className="mt-1 text-xs text-gray-500">（仅统计 NowPlayingItem 且未暂停）</div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">正在播放列表</div>
          <div className="text-xs text-gray-500">{data ? `共 ${data.sessions.length} 条` : ""}</div>
        </div>

        <div className="mt-3 overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="text-left text-gray-600 border-b">
              <tr>
                <th className="py-2 px-3">用户名</th>
                <th className="py-2 px-3">设备</th>
                <th className="py-2 px-3">客户端</th>
                <th className="py-2 px-3">正在播放</th>
                <th className="py-2 px-3">IP</th>
                <th className="py-2 px-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {(data?.sessions ?? []).map((s) => (
                <tr key={s.id} className="border-b last:border-b-0">
                  <td className="py-2 px-3">{s.userName || "-"}</td>
                  <td className="py-2 px-3">{s.device || "-"}</td>
                  <td className="py-2 px-3">{s.client || "-"}</td>
                  <td className="py-2 px-3">{s.nowPlaying || "-"}</td>
                  <td className="py-2 px-3 font-mono text-xs">{s.ip || "-"}</td>
                  <td className="py-2 px-3">{s.paused ? "暂停" : "播放中"}</td>
                </tr>
              ))}
              {data && data.sessions.length === 0 ? (
                <tr>
                  <td className="py-6 px-3 text-gray-500" colSpan={6}>
                    当前无播放会话
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
