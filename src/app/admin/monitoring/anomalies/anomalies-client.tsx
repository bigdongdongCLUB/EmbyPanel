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
  excerpt?: string;
  detectedAt: string;
  sessions: Array<{ device: string; client: string; ip: string; nowPlaying: string }>;
};

type Data = {
  ok: boolean;
  rangeDays: number;
  since: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: { totalEvents: number; totalUsers: number };
  anomalies: Anomaly[];
};

function ipPrefix3(ip: string) {
  const m = String(ip || "").trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\./);
  if (!m) return "";
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function isCrossRegionByIp(ips: string[]) {
  const prefixes = Array.from(new Set((ips || []).map(ipPrefix3).filter(Boolean)));
  return prefixes.length >= 2;
}

function TypeBadge({ crossRegion }: { crossRegion: boolean }) {
  if (crossRegion) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs bg-red-50 text-red-700 border-red-200">
        异地多设备
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs bg-amber-50 text-amber-700 border-amber-200">
      同时多设备
    </span>
  );
}

function formatDateTimeShanghai(v?: string) {
  if (!v) return "-";
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function MonitoringAnomaliesClient() {
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [serverId, setServerId] = useState<string>("__ALL__");
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState(false);
  const [runningScan, setRunningScan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);

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
      if (q.trim()) url.searchParams.set("q", q.trim());
      url.searchParams.set("rangeDays", String(rangeDays));
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(pageSize));
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

  async function runScanNow() {
    setRunningScan(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/jobs/anomaly-scan", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "scan_failed");
    } finally {
      setRunningScan(false);
    }
  }


  useEffect(() => {
    loadServers().catch((e) => setError(e?.message ?? "load_servers_failed"));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [serverId, rangeDays, q, pageSize]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, rangeDays, q, page, pageSize]);


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="border rounded px-3 py-2 min-w-[220px]"
          placeholder="搜索用户名"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

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

        <button className="border rounded px-3 py-2" onClick={runScanNow} disabled={runningScan}>
          {runningScan ? "检测中..." : "立即检测"}
        </button>

        {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}

      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">异常列表（定时任务每5分钟检测）</div>
          <div className="text-xs text-gray-500">{data ? `共 ${data.total} 条，当前第 ${data.page}/${data.totalPages} 页` : ""}</div>
        </div>

        <div className="mt-3 overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="text-left text-gray-600 border-b">
              <tr>
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
                const crossRegion = isCrossRegionByIp(a.ips || []);
                return (
                  <React.Fragment key={a.id}>
                    <tr className="border-b">
                      <td className="py-2 px-3">{a.user?.name || "-"}</td>
                      <td className="py-2 px-3">{a.server?.name || "-"}</td>
                      <td className="py-2 px-3">
                        <TypeBadge crossRegion={crossRegion} />
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
                      <td className="py-2 px-3 text-xs text-gray-700">
                        <div>{a.description || "-"}</div>
                        <div className="mt-1 space-y-1">
                          {a.sessions.length ? (
                            a.sessions.slice(0, 2).map((s, idx) => (
                              <div key={idx} className="text-[11px] leading-4 text-gray-600">
                                <div>
                                  📱 {s.device || "未知设备"}
                                  {s.client ? ` (${s.client})` : ""}
                                </div>
                                <div>正在播放: {s.nowPlaying || "未知"}</div>
                              </div>
                            ))
                          ) : a.excerpt ? (
                            <div className="text-[11px] text-gray-500">{a.excerpt}</div>
                          ) : null}
                          {a.sessions.length > 2 ? <div className="text-[11px] text-gray-500">… 另有 {a.sessions.length - 2} 台设备</div> : null}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-700">{formatDateTimeShanghai(a.detectedAt)}</td>
                    </tr>
                    
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

        {data ? (
          <div className="mt-3 flex items-center gap-2 text-sm border-t pt-3">
            <div className="mr-auto text-gray-600">第 {data.total ? (data.page - 1) * pageSize + 1 : 0}-{Math.min(data.page * pageSize, data.total)} 条，共 {data.total} 条记录</div>
            <button className="border rounded px-2 py-1 disabled:opacity-40" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
            <span className="border rounded px-2 py-1 text-blue-600">{data.page}</span>
            <button className="border rounded px-2 py-1 disabled:opacity-40" disabled={page >= data.totalPages || loading} onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}>›</button>
            <select className="h-9 border rounded px-2 text-sm" value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value="10">10/页</option>
              <option value="20">20/页</option>
              <option value="50">50/页</option>
              <option value="100">100/页</option>
            </select>
          </div>
        ) : null}
      </div>

    </div>
  );
}
