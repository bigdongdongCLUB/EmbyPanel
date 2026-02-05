"use client";

import React, { useEffect, useMemo, useState } from "react";

type ServerOption = { id: string; name: string; enabled: boolean };

type Anomaly = {
  key: string;
  server: { id: string; name: string };
  user: { id: string; name: string };
  type: "MULTI_DEVICE" | "GEO_SHARE";
  sessionCount: number;
  ips: string[];
  titles: string[];
  description: string;
  detectedAt: string;
  sessions: Array<{ id: string; device: string; client: string; ip: string; nowPlaying: string }>;
};

type Data = {
  ok: boolean;
  detectedAt: string;
  scope: "single" | "all";
  summary: { total: number; multiDevice: number; geoShare: number };
  anomalies: Anomaly[];
  warnings: any[];
};

function TypeBadge({ type }: { type: Anomaly["type"] }) {
  const label = type === "GEO_SHARE" ? "异地共享" : "同时多设备";
  const cls = type === "GEO_SHARE" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200";
  return <span className={"inline-flex items-center px-2 py-0.5 rounded border text-xs " + cls}>{label}</span>;
}

export function MonitoringAnomaliesClient() {
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [serverId, setServerId] = useState<string>("__ALL__");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalSec = 60;

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
  }, [serverId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => refresh(), intervalSec * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, serverId]);

  const totalLabel = useMemo(() => {
    if (!data) return "-";
    return String(data.summary?.total ?? 0);
  }, [data]);

  const multiLabel = useMemo(() => {
    if (!data) return "-";
    return String(data.summary?.multiDevice ?? 0);
  }, [data]);

  const geoLabel = useMemo(() => {
    if (!data) return "-";
    return String(data.summary?.geoShare ?? 0);
  }, [data]);

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">总异常数（实时）</div>
          <div className="mt-2 text-2xl font-semibold">{totalLabel}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">同时多设备播放</div>
          <div className="mt-2 text-2xl font-semibold">{multiLabel}</div>
          <div className="mt-1 text-xs text-gray-500">（同一用户同一时刻 ≥2 个播放会话）</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">异地共享检测</div>
          <div className="mt-2 text-2xl font-semibold">{geoLabel}</div>
          <div className="mt-1 text-xs text-gray-500">（同一用户同一时刻出现 ≥2 个不同 IP）</div>
        </div>
      </div>

      {data?.warnings?.length ? (
        <details className="bg-white border rounded-lg p-4">
          <summary className="text-sm cursor-pointer">告警/告知（{data.warnings.length}）</summary>
          <pre className="mt-2 text-xs whitespace-pre-wrap text-gray-600">{JSON.stringify(data.warnings, null, 2)}</pre>
        </details>
      ) : null}

      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">异常列表</div>
          <div className="text-xs text-gray-500">{data ? `共 ${data.anomalies.length} 条 · ${new Date(data.detectedAt).toLocaleString()}` : ""}</div>
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
                const isOpen = !!open[a.key];
                return (
                  <React.Fragment key={a.key}>
                    <tr className="border-b">
                      <td className="py-2 px-3">
                        <button className="text-xs border rounded px-2 py-1" onClick={() => setOpen((p) => ({ ...p, [a.key]: !p[a.key] }))}>
                          {isOpen ? "-" : "+"}
                        </button>
                      </td>
                      <td className="py-2 px-3">{a.user?.name || "-"}</td>
                      <td className="py-2 px-3">{a.server?.name || "-"}</td>
                      <td className="py-2 px-3">
                        <TypeBadge type={a.type} />
                      </td>
                      <td className="py-2 px-3">
                        <div className="text-xs text-gray-700">{a.sessions.map((s) => s.device || "-").filter(Boolean).slice(0, 2).join(" / ")}{a.sessions.length > 2 ? ` 等 ${a.sessions.length} 台` : ""}</div>
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
                                  {a.sessions.map((s) => (
                                    <tr key={s.id} className="border-b last:border-b-0">
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
                    当前未检测到“同一用户多设备同时播放”的异常（仅实时）
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
