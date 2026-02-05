"use client";

import React, { useEffect, useState } from "react";

type ServerOption = { id: string; name: string; enabled: boolean };

type Anomaly = {
  id: string;
  server: { id: string; name: string };
  user: { id: string; name: string };
  type: "MULTI_DEVICE";
  sessionCount: number;
  ips: string[];
  description: string;
  detectedAt: string;
  sessions: Array<{ device: string; client: string; ip: string; nowPlaying: string }>;
};

type Data = {
  ok: boolean;
  rangeDays: number;
  since: string;
  summary: { totalEvents: number; totalUsers: number };
  anomalies: Anomaly[];
};

function TypeBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs bg-amber-50 text-amber-700 border-amber-200">
      同时多设备
    </span>
  );
}

export function MonitoringAnomaliesClient() {
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [serverId, setServerId] = useState<string>("__ALL__");
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalSec = 120;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function loadServers() {
    const res = await fetch("/api/admin/emby-servers", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
    const list = (json.servers ?? []).filter((s: any) => s.enabled);
    setServers(list);
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(window.location.origin + "/api/admin/monitoring/anomalies");
      if (serverId && serverId !== "__ALL__") url.searchParams.set("serverId", serverId);
      url.searchParams.set("rangeDays", String(rangeDays));
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
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, rangeDays]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => refresh(), intervalSec * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, serverId, rangeDays]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select className="border rounded px-3 py-2" value={serverId} onChange={(e) => setServerId(e.target.value)}>
          <option value="__ALL__">全部服务器</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select className="border rounded px-3 py-2" value={String(rangeDays)} onChange={(e) => setRangeDays(Number(e.target.value))}>
          <option value="7">最近 7 天</option>
          <option value="30">最近 30 天</option>
        </select>

        <button className="border rounded px-3 py-2" onClick={refresh} disabled={loading}>
          刷新
        </button>

        <label className="flex items-center gap-2 text-sm text-gray-700 ml-2">
          自动刷新（{intervalSec}秒）
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
        </label>

        {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}

      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">异常列表</div>
          <div className="text-xs text-gray-500">{data ? `共 ${data.anomalies.length} 条` : ""}</div>
        </div>

        <div className="mt-3 overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="text-left text-gray-600 border-b">
              <tr>
                <th className="py-2 px-3 w-[44px]"></th>
                <th className="py-2 px-3">用户名</th>
                <th className="py-2 px-3">服务器</th>
                <th className="py-2 px-3">异常类型</th>
                <th className="py-2 px-3">设备信息</th>
                <th className="py-2 px-3">IP 地址</th>
                <th className="py-2 px-3">说明</th>
                <th className="py-2 px-3">检测时间</th>
              </tr>
            </thead>
            <tbody>
              {(data?.anomalies ?? []).map((a) => {
                const isOpen = !!open[a.id];
                return (
                  <React.Fragment key={a.id}>
                    <tr className="border-b">
                      <td className="py-2 px-3">
                        <button className="text-xs border rounded px-2 py-1" onClick={() => setOpen((p) => ({ ...p, [a.id]: !p[a.id] }))}>
                          {isOpen ? "-" : "+"}
                        </button>
                      </td>
                      <td className="py-2 px-3">{a.user?.name || "-"}</td>
                      <td className="py-2 px-3">{a.server?.name || "-"}</td>
                      <td className="py-2 px-3">
                        <TypeBadge />
                      </td>
                      <td className="py-2 px-3">
                        <div className="text-xs text-gray-700">
                          {a.sessions
                            .map((s) => s.device || "-")
                            .filter(Boolean)
                            .slice(0, 2)
                            .join(" / ")}
                          {a.sessions.length > 2 ? ` 等 ${a.sessions.length} 台` : ""}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          {a.ips?.length
                            ? a.ips.map((ip) => (
                                <span key={ip} className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono bg-gray-50">
                                  {ip}
                                </span>
                              ))
                            : "-"}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-700">{a.description || "-"}</td>
                      <td className="py-2 px-3 text-xs text-gray-700">{a.detectedAt ? new Date(a.detectedAt).toLocaleString() : "-"}</td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-b">
                        <td className="py-2 px-3" colSpan={8}>
                          <div className="bg-gray-50 border rounded p-3">
                            <div className="text-xs text-gray-600">会话明细</div>
                            <div className="mt-2 overflow-auto">
                              <table className="min-w-[900px] w-full text-xs">
                                <thead className="text-left text-gray-600 border-b">
                                  <tr>
                                    <th className="py-2 px-2">设备</th>
                                    <th className="py-2 px-2">客户端</th>
                                    <th className="py-2 px-2">正在播放</th>
                                    <th className="py-2 px-2">IP</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {a.sessions.map((s, idx) => (
                                    <tr key={idx} className="border-b last:border-b-0">
                                      <td className="py-2 px-2">{s.device || "-"}</td>
                                      <td className="py-2 px-2">{s.client || "-"}</td>
                                      <td className="py-2 px-2">{s.nowPlaying || "-"}</td>
                                      <td className="py-2 px-2 font-mono">{s.ip || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}

              {data && data.anomalies.length === 0 ? (
                <tr>
                  <td className="py-6 px-3 text-gray-500" colSpan={8}>
                    暂无异常
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
