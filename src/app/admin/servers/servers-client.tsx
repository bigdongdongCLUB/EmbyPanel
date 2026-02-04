"use client";

import { useEffect, useMemo, useState } from "react";

type Server = {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  lastHealthAt: string | null;
  lastHealthOk: boolean | null;
  lastHealthMsg: string | null;
};

type ModalState =
  | { open: false }
  | {
      open: true;
      id: string;
      name: string;
      baseUrl: string;
      apiKey: string;
      enabled: boolean;
    };

type StatsModalState =
  | { open: false }
  | {
      open: true;
      id: string;
      name: string;
      loading: boolean;
      data: null | {
        emby: { serverName: string | null; version: string | null };
        users: { total: number; enabled: number; disabled: number; active30d: number; mauPct: number };
      };
      error: string | null;
    };

type UsersModalState =
  | { open: false }
  | {
      open: true;
      id: string;
      name: string;
      loading: boolean;
      users: Array<{
        id: string;
        name: string;
        policy: { isDisabled: boolean; isAdministrator: boolean };
        lastLoginDate: string | null;
        lastActivityDate: string | null;
      }>;
      error: string | null;
    };

export function ServersClient() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [modal, setModal] = useState<ModalState>({ open: false });
  const [statsModal, setStatsModal] = useState<StatsModalState>({ open: false });
  const [usersModal, setUsersModal] = useState<UsersModalState>({ open: false });

  const canSubmit = useMemo(() => !!name && !!baseUrl && apiKey.length >= 10, [name, baseUrl, apiKey]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/emby-servers", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setServers(json.servers);
    } catch (e: any) {
      setError(e?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-8">
      <section className="border rounded-lg p-4">
        <h2 className="font-semibold">新增服务器</h2>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm">名称</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="比如：4U Emby" />
          </div>
          <div>
            <label className="text-sm">Base URL</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://host:8096" />
          </div>
          <div>
            <label className="text-sm">API Key</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Emby API Key" />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
            disabled={!canSubmit}
            onClick={async () => {
              setError(null);
              const res = await fetch("/api/admin/emby-servers", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, baseUrl, apiKey }),
              });
              if (!res.ok) {
                const t = await res.text();
                setError(t);
                return;
              }
              setName("");
              setBaseUrl("");
              setApiKey("");
              await refresh();
            }}
          >
            保存
          </button>
          <button className="border rounded px-3 py-2" onClick={refresh}>
            刷新
          </button>
        </div>
        {error ? <pre className="mt-3 text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}
      </section>

      <section className="border rounded-lg p-4">
        <h2 className="font-semibold">服务器列表</h2>

        {loading ? <div className="mt-3 text-sm text-gray-500">加载中…</div> : null}

        {!loading && servers.length === 0 ? <div className="mt-3 text-sm text-gray-500">暂无服务器</div> : null}

        <div className="mt-4 space-y-3">
          {servers.map((s) => (
            <div key={s.id} className="border rounded p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-sm text-gray-600">{s.baseUrl}</div>
                <div className="text-xs text-gray-500 mt-1">
                  health: {s.lastHealthOk === null ? "-" : s.lastHealthOk ? "OK" : "FAIL"} {s.lastHealthMsg ? `· ${s.lastHealthMsg}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="border rounded px-3 py-2"
                  onClick={async () => {
                    const res = await fetch(`/api/admin/emby-servers/${s.id}/test`, { method: "POST" });
                    const txt = await res.text();
                    if (!res.ok) {
                      alert(`测试失败: ${txt}`);
                    } else {
                      alert(`测试成功: ${txt}`);
                    }
                    await refresh();
                  }}
                >
                  测试连接
                </button>

                <button
                  className="border rounded px-3 py-2"
                  onClick={async () => {
                    setStatsModal({ open: true, id: s.id, name: s.name, loading: true, data: null, error: null });
                    try {
                      const res = await fetch(`/api/admin/emby-servers/${s.id}/stats`, { cache: "no-store" });
                      const json = await res.json().catch(() => null);
                      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
                      setStatsModal({ open: true, id: s.id, name: s.name, loading: false, data: json, error: null } as any);
                    } catch (e: any) {
                      setStatsModal({ open: true, id: s.id, name: s.name, loading: false, data: null, error: e?.message ?? "load_failed" });
                    }
                  }}
                >
                  统计
                </button>

                <button
                  className="border rounded px-3 py-2"
                  onClick={async () => {
                    setUsersModal({ open: true, id: s.id, name: s.name, loading: true, users: [], error: null });
                    try {
                      const res = await fetch(`/api/admin/emby-servers/${s.id}/users`, { cache: "no-store" });
                      const json = await res.json().catch(() => null);
                      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
                      setUsersModal({ open: true, id: s.id, name: s.name, loading: false, users: json.users ?? [], error: null });
                    } catch (e: any) {
                      setUsersModal({ open: true, id: s.id, name: s.name, loading: false, users: [], error: e?.message ?? "load_failed" });
                    }
                  }}
                >
                  用户
                </button>

                <button
                  className="border rounded px-3 py-2"
                  onClick={() =>
                    setModal({
                      open: true,
                      id: s.id,
                      name: s.name,
                      baseUrl: s.baseUrl,
                      apiKey: "",
                      enabled: s.enabled,
                    })
                  }
                >
                  编辑
                </button>

                <button
                  className="border rounded px-3 py-2"
                  onClick={async () => {
                    const nextEnabled = !s.enabled;
                    const res = await fetch(`/api/admin/emby-servers/${s.id}`, {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ enabled: nextEnabled }),
                    });
                    if (!res.ok) {
                      alert(`更新失败: ${await res.text()}`);
                      return;
                    }
                    await refresh();
                  }}
                >
                  {s.enabled ? "禁用" : "启用"}
                </button>

                <button
                  className="border rounded px-3 py-2 text-red-600"
                  onClick={async () => {
                    if (!confirm(`确定删除服务器：${s.name} ?`)) return;
                    const res = await fetch(`/api/admin/emby-servers/${s.id}`, { method: "DELETE" });
                    if (!res.ok) {
                      alert(`删除失败: ${await res.text()}`);
                      return;
                    }
                    await refresh();
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {statsModal.open ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-lg p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">统计 - {statsModal.name}</div>
              <button className="text-sm underline" onClick={() => setStatsModal({ open: false })}>
                关闭
              </button>
            </div>

            {statsModal.loading ? <div className="mt-3 text-sm text-gray-500">加载中…</div> : null}
            {statsModal.error ? <pre className="mt-3 text-xs text-red-600 whitespace-pre-wrap">{statsModal.error}</pre> : null}

            {(!statsModal.loading && statsModal.data) ? (
              <div className="mt-4 space-y-2 text-sm">
                <div>
                  Emby 版本：<span className="font-mono">{(statsModal.data as any).emby?.version ?? "-"}</span>
                </div>
                <div>
                  Emby ServerName：<span className="font-mono">{(statsModal.data as any).emby?.serverName ?? "-"}</span>
                </div>
                <div className="pt-2 border-t">
                  <div>用户总数：{(statsModal.data as any).users?.total ?? 0}</div>
                  <div>启用用户：{(statsModal.data as any).users?.enabled ?? 0}</div>
                  <div>禁用用户：{(statsModal.data as any).users?.disabled ?? 0}</div>
                  <div className="pt-2">30日活跃用户（30日内有登录）：{(statsModal.data as any).users?.active30d ?? 0}</div>
                  <div>月活占比（MAU%）：{(statsModal.data as any).users?.mauPct ?? 0}%</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {usersModal.open ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">用户 - {usersModal.name}</div>
              <button className="text-sm underline" onClick={() => setUsersModal({ open: false })}>
                关闭
              </button>
            </div>

            {usersModal.loading ? <div className="mt-3 text-sm text-gray-500">加载中…</div> : null}
            {usersModal.error ? <pre className="mt-3 text-xs text-red-600 whitespace-pre-wrap">{usersModal.error}</pre> : null}

            {!usersModal.loading ? (
              <div className="mt-4 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-600">
                    <tr>
                      <th className="py-2">用户名</th>
                      <th className="py-2">状态</th>
                      <th className="py-2">管理员</th>
                      <th className="py-2">最后登录</th>
                      <th className="py-2">最后活动</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersModal.users.map((u) => (
                      <tr key={u.id} className="border-t">
                        <td className="py-2 font-mono">{u.name}</td>
                        <td className="py-2">{u.policy.isDisabled ? "禁用" : "启用"}</td>
                        <td className="py-2">{u.policy.isAdministrator ? "是" : "否"}</td>
                        <td className="py-2 font-mono text-xs">{u.lastLoginDate ?? "-"}</td>
                        <td className="py-2 font-mono text-xs">{u.lastActivityDate ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {usersModal.users.length === 0 ? <div className="text-sm text-gray-500">无用户</div> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {modal.open ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-lg p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">编辑服务器</div>
              <button className="text-sm underline" onClick={() => setModal({ open: false })}>
                关闭
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <div>
                <label className="text-sm">名称</label>
                <input
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={modal.name}
                  onChange={(e) => setModal({ ...modal, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm">Base URL</label>
                <input
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={modal.baseUrl}
                  onChange={(e) => setModal({ ...modal, baseUrl: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm">API Key（留空=不修改）</label>
                <input
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={modal.apiKey}
                  onChange={(e) => setModal({ ...modal, apiKey: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="enabled"
                  type="checkbox"
                  checked={modal.enabled}
                  onChange={(e) => setModal({ ...modal, enabled: e.target.checked })}
                />
                <label htmlFor="enabled" className="text-sm">
                  启用
                </label>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="bg-black text-white rounded px-3 py-2"
                onClick={async () => {
                  const payload: any = {
                    name: modal.name,
                    baseUrl: modal.baseUrl,
                    enabled: modal.enabled,
                  };
                  if (modal.apiKey.trim()) payload.apiKey = modal.apiKey.trim();

                  const res = await fetch(`/api/admin/emby-servers/${modal.id}`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  if (!res.ok) {
                    alert(`保存失败: ${await res.text()}`);
                    return;
                  }
                  setModal({ open: false });
                  await refresh();
                }}
              >
                保存
              </button>
              <button className="border rounded px-3 py-2" onClick={() => setModal({ open: false })}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
