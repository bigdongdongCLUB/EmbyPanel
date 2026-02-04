"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  serverId: string;
  serverName: string;
  username: string;
  embyUserId: string;
  status: string;
  isAdmin: boolean;
  lastLoginDate: string | null;
  lastActivityDate: string | null;
};

function dash(v: any) {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

export function UsersClient() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [linkedOnly, setLinkedOnly] = useState(true);

  const hint = useMemo(() => (q.trim() ? `搜索: ${q.trim()}` : ""), [q]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(window.location.origin + "/api/admin/emby-users");
      if (q.trim()) url.searchParams.set("q", q.trim());
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
      setRows(json.users ?? []);
      setErrors(json.errors ?? []);
    } catch (e: any) {
      setError(e?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex gap-2 items-center">
          <input
            className="w-full md:w-80 border rounded px-3 py-2"
            placeholder="搜索 Emby 用户名"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="border rounded px-3 py-2" onClick={refresh}>
            查询
          </button>
          <span className="text-xs text-gray-500">{hint}</span>
        </div>
        <div className="flex gap-3 items-center">
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={linkedOnly} onChange={(e) => setLinkedOnly(e.target.checked)} />
            仅显示已入库用户
          </label>
          <button className="border rounded px-3 py-2" onClick={refresh}>
            刷新
          </button>
        </div>
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}
      {errors.length ? (
        <pre className="text-xs text-amber-700 whitespace-pre-wrap">部分服务器拉取失败：{JSON.stringify(errors, null, 2)}</pre>
      ) : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="border rounded-lg overflow-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="text-left text-gray-600 border-b">
            <tr>
              <th className="py-2 px-3">用户</th>
              <th className="py-2 px-3">所属服务器</th>
              <th className="py-2 px-3">状态</th>
              <th className="py-2 px-3">管理员</th>
              <th className="py-2 px-3">最后登录</th>
              <th className="py-2 px-3">最后活动</th>
              <th className="py-2 px-3">EmbyUserId</th>
              <th className="py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r: any) => (linkedOnly ? !!(r as any).panelUserId : true))
              .map((r) => (
              <tr key={`${r.serverId}:${r.embyUserId}`} className="border-b last:border-b-0">
                <td className="py-2 px-3 font-mono">{r.username}</td>
                <td className="py-2 px-3">{r.serverName}</td>
                <td className="py-2 px-3">{dash(r.status)}</td>
                <td className="py-2 px-3">{r.isAdmin ? "是" : "否"}</td>
                <td className="py-2 px-3 font-mono text-xs">{dash(r.lastLoginDate)}</td>
                <td className="py-2 px-3 font-mono text-xs">{dash(r.lastActivityDate)}</td>
                <td className="py-2 px-3 font-mono text-xs">{dash(r.embyUserId)}</td>
                <td className="py-2 px-3 text-gray-500">-</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td className="py-6 px-3 text-gray-500" colSpan={8}>
                  无数据
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
