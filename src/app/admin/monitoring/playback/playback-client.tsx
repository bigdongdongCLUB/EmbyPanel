"use client";

import { useEffect, useMemo, useState } from "react";

type ServerOption = { id: string; name: string; enabled: boolean };

type Data = {
  ok: boolean;
  server: { id: string; name: string; baseUrl: string };
  rangeDays: number;
  requirePlugin?: boolean;
  pluginInstalled?: boolean;
  message?: string;
  activeUsers?: number;
  topMovies?: Array<{ id: string; name: string; playCount: number | null; lastPlayed: string | null; year: number | null }>;
  topEpisodes?: Array<{ id: string; seriesName: string; name: string; season: number | null; episode: number | null; playCount: number | null; lastPlayed: string | null }>;
  warn?: any;
};

export function PlaybackStatsClient() {
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [serverId, setServerId] = useState("");
  const [rangeDays, setRangeDays] = useState<7 | 30 | 180 | 365>(30);

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
      const url = new URL(window.location.origin + "/api/admin/monitoring/playback");
      url.searchParams.set("serverId", serverId);
      url.searchParams.set("rangeDays", String(rangeDays));
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json().catch(() => null);
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
  }, [serverId, rangeDays]);

  const titleRange = useMemo(() => {
    if (rangeDays === 7) return "近 7 天";
    if (rangeDays === 30) return "近 30 天";
    if (rangeDays === 180) return "近 180 天";
    return "近 365 天";
  }, [rangeDays]);

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

        <select className="border rounded px-3 py-2" value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value) as any)}>
          <option value={7}>7天</option>
          <option value={30}>30天</option>
          <option value={180}>180天</option>
          <option value={365}>365天</option>
        </select>

        <button className="border rounded px-3 py-2" onClick={refresh} disabled={loading || !serverId}>
          刷新
        </button>

        {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}

      {data?.requirePlugin ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-900">
          {data.message ?? "需要安装 Playback Reporting 插件才可以进行统计"}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">活跃人数（{titleRange}）</div>
          <div className="mt-2 text-2xl font-semibold">{data && !data.requirePlugin ? String(data.activeUsers ?? "-") : "-"}</div>
          <div className="mt-1 text-xs text-gray-500">按 Emby 用户 LastActivityDate 统计</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white border rounded-lg p-4">
          <div className="font-medium text-sm">电影播放榜（{titleRange}）</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-[520px] w-full text-sm">
              <thead className="text-left text-gray-600 border-b">
                <tr>
                  <th className="py-2 px-3">电影</th>
                  <th className="py-2 px-3">播放次数</th>
                  <th className="py-2 px-3">最近播放</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topMovies ?? []).map((m) => (
                  <tr key={m.id} className="border-b last:border-b-0">
                    <td className="py-2 px-3">{m.year ? `${m.name} (${m.year})` : m.name}</td>
                    <td className="py-2 px-3">{m.playCount ?? "-"}</td>
                    <td className="py-2 px-3 font-mono text-xs">{m.lastPlayed ? String(m.lastPlayed).slice(0, 19) : "-"}</td>
                  </tr>
                ))}
                {data && !data.requirePlugin && (data.topMovies ?? []).length === 0 ? (
                  <tr>
                    <td className="py-6 px-3 text-gray-500" colSpan={3}>
                      暂无数据（可能该时间范围内无 LastPlayedDate，或 Emby 未提供）
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="font-medium text-sm">剧集播放榜（{titleRange}）</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-[640px] w-full text-sm">
              <thead className="text-left text-gray-600 border-b">
                <tr>
                  <th className="py-2 px-3">剧集</th>
                  <th className="py-2 px-3">播放次数</th>
                  <th className="py-2 px-3">最近播放</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topEpisodes ?? []).map((e) => (
                  <tr key={e.id} className="border-b last:border-b-0">
                    <td className="py-2 px-3">
                      {e.seriesName ? `${e.seriesName} S${e.season ?? "?"}E${e.episode ?? "?"}` : e.name}
                    </td>
                    <td className="py-2 px-3">{e.playCount ?? "-"}</td>
                    <td className="py-2 px-3 font-mono text-xs">{e.lastPlayed ? String(e.lastPlayed).slice(0, 19) : "-"}</td>
                  </tr>
                ))}
                {data && !data.requirePlugin && (data.topEpisodes ?? []).length === 0 ? (
                  <tr>
                    <td className="py-6 px-3 text-gray-500" colSpan={3}>
                      暂无数据（可能该时间范围内无 LastPlayedDate，或 Emby 未提供）
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        说明：播放榜单使用 Emby Items 的 PlayCount + (LastPlayedDate/DateLastPlayed) 做近似筛选；如果你的 Emby 未提供这些字段或需要插件，我们再按实际接口适配。
      </div>
    </div>
  );
}
