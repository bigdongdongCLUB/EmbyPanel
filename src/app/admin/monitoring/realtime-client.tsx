"use client";

import { useEffect, useMemo, useState } from "react";
import { ToggleSwitch } from "../settings/toggle-switch";
import { PaginationBar } from "@/components/pagination-bar";

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

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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
    setQ("");
    setPage(1);
    setPageSize(10);
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

  const filtered = useMemo(() => {
    const list = data?.sessions ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((s) => {
      const hay = [s.userName, s.device, s.client, s.nowPlaying, s.ip].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(qq);
    });
  }, [data, q]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total/ pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-center bg-white border border-[#eaeaea] rounded-xl p-2 shadow-sm">
        <select className="border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={serverId} onChange={(e) => setServerId(e.target.value)}>
          <option value="">选择服务器…</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button className="border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" onClick={refresh} disabled={loading || !serverId}>
          刷新
        </button>

        <label className="flex items-center gap-2 text-sm text-gray-700 ml-2">
          自动刷新（{intervalSec}秒）
          <ToggleSwitch checked={autoRefresh} onChange={setAutoRefresh} textOn="已启用" textOff="已禁用" />
        </label>

        {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl px-8 py-6 shadow-sm">
          <div className="text-sm text-gray-500">服务器状态</div>
          <div className="mt-2 text-[32px] leading-none font-bold">{onlineLabel}</div>
          <div className="mt-2 text-[13px] text-gray-500">{data?.server?.version ? `Emby ${data.server.version}` : ""}</div>
        </div>
        <div className="bg-white rounded-2xl px-8 py-6 border-2 border-[#e3001b] shadow-[0_8px_24px_rgba(227,0,27,0.08)]">
          <div className="text-sm text-gray-500">正在播放</div>
          <div className="mt-2 text-[32px] leading-none font-bold text-[#e3001b]">{data ? data.playingCount : "-"}</div>
          <div className="mt-2 text-[13px] text-gray-500">（仅统计 NowPlayingItem 且未暂停）</div>
        </div>
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium text-sm">正在播放列表</div>
          <div className="text-xs text-gray-500">{data ? `共 ${total} 条` : ""}</div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 justify-between">
          <div className="w-[320px]">
            <input
              type="search"
              className="w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none"
              placeholder="搜索用户名/设备/客户端/IP/正在播放"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="flex items-center gap-2">
          </div>
        </div>

        <div className="mt-3 overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="text-left text-[#666] border-y border-[#eaeaea] bg-[#f8f9fa]">
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
              {pageRows.map((s) => (
                <tr key={s.id} className="border-b last:border-b-0">
                  <td className="py-2 px-3">{s.userName || "-"}</td>
                  <td className="py-2 px-3">{s.device || "-"}</td>
                  <td className="py-2 px-3">{s.client || "-"}</td>
                  <td className="py-2 px-3">{s.nowPlaying || "-"}</td>
                  <td className="py-2 px-3 font-mono text-xs">{s.ip || "-"}</td>
                  <td className="py-2 px-3">{s.paused ? "暂停" : "播放中"}</td>
                </tr>
              ))}
              {data && total === 0 ? (
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

      <div className="mt-3">
        <PaginationBar
          total={total}
          page={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={(p) => setPage(Math.min(Math.max(1, p), totalPages))}
          onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
        />
      </div>
    </div>
  );
}
