"use client";

import React, { useEffect, useState } from "react";
import { PaginationBar } from "@/components/pagination-bar";

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
      <span className="inline-flex items-center px-2 py-1 rounded-[4px] border text-[12px] leading-4 whitespace-nowrap bg-red-50 text-red-700 border-red-200">
        异地多设备
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-1 rounded-[4px] border text-[12px] leading-4 whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200">
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
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-center bg-white border border-[#eaeaea] rounded-xl p-2 shadow-sm">
        <input
          className="border border-transparent bg-[#f4f5f7] rounded-lg px-3 py-2 min-w-[220px] focus:border-[#e3001b] outline-none"
          placeholder="搜索用户名"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select className="border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={serverId} onChange={(e) => setServerId(e.target.value)}>
          <option value="__ALL__">全部服务器</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select className="border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={String(rangeDays)} onChange={(e) => setRangeDays(Number(e.target.value))}>
          <option value="7">最近 7 天</option>
          <option value="30">最近 30 天</option>
        </select>

        <button className="border border-[#eaeaea] bg-white rounded-lg px-3 py-2 hover:bg-[#f4f5f7]" onClick={refresh} disabled={loading}>
          刷新
        </button>

        <button className="bg-[#e3001b] hover:bg-[#c20017] text-white rounded-lg px-4 py-2" onClick={runScanNow} disabled={runningScan}>
          {runningScan ? "检测中..." : "立即检测"}
        </button>

        {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}

      <div className="bg-white border border-[#eaeaea] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">异常列表（定时任务每5分钟检测）</div>
          <div className="text-xs text-gray-500">{data ? `共 ${data.total} 条，当前第 ${data.page}/${data.totalPages} 页` : ""}</div>
        </div>

        <div className="mt-3 overflow-auto">
          <table className="min-w-[1100px] w-full text-[14px]">
            <thead className="text-left text-[#666] text-[13px] border-y border-[#eaeaea] bg-[#f8f9fa]">
              <tr>
                                <th className="py-4 px-3 font-medium">用户名</th>
                <th className="py-4 px-3 font-medium">服务器</th>
                <th className="py-4 px-3 font-medium">异常类型</th>
                <th className="py-4 px-3 font-medium">设备信息</th>
                <th className="py-4 px-3 font-medium">IP 地址</th>
                <th className="py-4 px-3 font-medium">说明</th>
                <th className="py-4 px-3 font-medium">检测时间</th>
              </tr>
            </thead>
            <tbody>
              {(data?.anomalies ?? []).map((a) => {
                const crossRegion = isCrossRegionByIp(a.ips || []);
                return (
                  <React.Fragment key={a.id}>
                    <tr className="border-b border-[#eaeaea]">
                      <td className="py-4 px-3 leading-6">{a.user?.name || "-"}</td>
                      <td className="py-4 px-3 leading-6">{a.server?.name || "-"}</td>
                      <td className="py-4 px-3 leading-6">
                        <TypeBadge crossRegion={crossRegion} />
                      </td>
                      <td className="py-4 px-3 leading-6">
                        <div className="text-[13px] text-gray-700">
                          {a.sessions
                            .map((s) => s.device || "-")
                            .filter(Boolean)
                            .slice(0, 2)
                            .join(" / ")}
                          {a.sessions.length > 2 ? ` 等 ${a.sessions.length} 台` : ""}
                        </div>
                      </td>
                      <td className="py-4 px-3 leading-6">
                        <div className={a.ips?.length > 1 ? "flex flex-col gap-1" : "flex flex-wrap gap-1"}>
                          {a.ips?.length
                            ? a.ips.map((ip) => (
                                <span key={ip} className="inline-flex items-center w-fit px-2 py-1 rounded-[4px] border border-[#eaeaea] text-[13px] leading-4 font-mono text-[#666] bg-[#f4f5f7]">
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
                              <div key={idx} className="text-[12px] leading-5 text-gray-600">
                                <div>
                                  📱 {s.device || "未知设备"}
                                  {s.client ? ` (${s.client})` : ""}
                                </div>
                                <div>正在播放: {s.nowPlaying || "未知"}</div>
                              </div>
                            ))
                          ) : a.excerpt ? (
                            <div className="text-[12px] text-gray-500">{a.excerpt}</div>
                          ) : null}
                          {a.sessions.length > 2 ? <div className="text-[12px] text-gray-500">… 另有 {a.sessions.length - 2} 台设备</div> : null}
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
          <div className="mt-0">
            <PaginationBar
              total={data.total}
              page={data.page}
              totalPages={data.totalPages}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(n) => { setPage(1); setPageSize(n); }}
            />
          </div>
        ) : null}
      </div>

    </div>
  );
}
