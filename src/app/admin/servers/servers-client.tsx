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
      showApiKey: boolean;
      loadingApiKey: boolean;
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
        // optional enrich fields (some APIs return these)
        anomalyStatus?: string | null;
        panel?: { username?: string | null; email?: string | null } | null;
      }>;
      error: string | null;
    };

function formatDateYmd(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLatencyMs(msg?: string | null) {
  if (!msg) return null;
  const m = msg.match(/(\d+)\s*ms/i);
  return m ? Number(m[1]) : null;
}

function UsersTable({
  serverId,
  users,
  q,
  setQ,
  page,
  setPage,
  pageSize,
  setPageSize,
  onRefresh,
}: {
  serverId: string;
  users: any[];
  q: string;
  setQ: (v: string) => void;
  page: number;
  setPage: (v: number) => void;
  pageSize: number;
  setPageSize: (v: number) => void;
  onRefresh: () => void;
}) {
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return users ?? [];
    return (users ?? []).filter((u: any) => {
      const hay = [u?.name, u?.panel?.username, u?.panel?.email].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(qq);
    });
  }, [users, q]);

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
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="border rounded px-3 py-2 w-[260px]"
            placeholder="搜索用户名/面板账号/邮箱"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />

          <button className="border rounded px-3 py-2" onClick={onRefresh}>
            刷新
          </button>
        </div>

        <div className="text-sm text-gray-600">共 {total} 个用户</div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-[1250px] w-full text-sm">
            <thead className="text-left text-gray-600 sticky top-0 bg-white border-b">
              <tr>
                <th className="py-2 px-3">用户名</th>
                <th className="py-2 px-3">异常状态</th>
                <th className="py-2 px-3">Emby用户状态</th>
                <th className="py-2 px-3">面板账号</th>
                <th className="py-2 px-3">邮箱</th>
                <th className="py-2 px-3">最后活动</th>
                <th className="py-2 px-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((u: any) => (
                <tr key={u.id} className="border-b last:border-b-0">
                  <td className="py-2 px-3 font-mono">{u.name}</td>
                  <td className="py-2 px-3">{u.anomalyStatus ?? "-"}</td>
                  <td className="py-2 px-3">
                    {u.policy?.isDisabled ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-red-600 font-medium">
                        <span>⊗</span>
                        <span>Emby已禁用</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-green-600 font-medium">
                        <span>✓</span>
                        <span>Emby正常</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono">{u.panel?.username ?? "-"}</td>
                  <td className="py-2 px-3">{u.panel?.email ?? "-"}</td>
                  <td className="py-2 px-3 font-mono text-xs">{formatDateYmd(u.lastActivityDate)}</td>
                  <td className="py-2 px-3">
                    <div className="flex gap-2">
                      <button
                        className="border rounded px-2 py-1 disabled:opacity-50"
                        disabled={!!u.policy?.isAdministrator}
                        title={u.policy?.isAdministrator ? "管理员账户不可禁用" : ""}
                        onClick={async () => {
                          const nextDisabled = !u.policy?.isDisabled;
                          const label = nextDisabled ? "禁用" : "启用";
                          if (!(await (window as any).showConfirm(`确定${label} Emby 用户：${u.name} ?`))) return;
                          const res = await fetch(`/api/admin/emby-servers/${serverId}/users/${u.id}`, {
                            method: "PATCH",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ disabled: nextDisabled }),
                          });
                          const txt = await res.text();
                          if (!res.ok) {
                            alert(`操作失败: ${txt}`);
                            return;
                          }
                          onRefresh();
                        }}
                      >
                        {u.policy?.isDisabled ? "启用" : "禁用"}
                      </button>

                      <button
                        className="border rounded px-2 py-1 text-red-600 disabled:opacity-50"
                        disabled={!!u.policy?.isAdministrator}
                        title={u.policy?.isAdministrator ? "管理员账户不可删除" : ""}
                        onClick={async () => {
                          const panelHint = u.panel?.username ? `\n\n提示：该用户已绑定面板账号（${u.panel.username}），本操作只删除 Emby 端用户，不会删除面板账号。` : "";
                          if (!(await (window as any).showConfirm(`确定从 Emby 服务器删除用户：${u.name} ?\n\n注意：此操作不可恢复。${panelHint}`))) return;
                          const res = await fetch(`/api/admin/emby-servers/${serverId}/users/${u.id}`, { method: "DELETE" });
                          const txt = await res.text();
                          if (!res.ok) {
                            alert(`删除失败: ${txt}`);
                            return;
                          }
                          onRefresh();
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {total === 0 ? (
                <tr>
                  <td className="py-6 px-3 text-gray-500" colSpan={7}>
                    无用户
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
          <div className="mr-auto text-gray-600">第 {total ? (safePage - 1) * pageSize + 1 : 0}-{Math.min(safePage * pageSize, total)} 条，共 {total} 条记录</div>

          <div className="flex items-center gap-2">
            <button className="border rounded px-2 py-1 disabled:opacity-40" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
            <span className="border rounded px-2 py-1 text-blue-600">{safePage}</span>
            <button className="border rounded px-2 py-1 disabled:opacity-40" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</button>

            <select
              className="h-9 border rounded px-2 text-sm"
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value="10">10/页</option>
              <option value="20">20/页</option>
              <option value="50">50/页</option>
              <option value="100">100/页</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [usersQ, setUsersQ] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(10);

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
            className="bg-gray-700 text-white rounded px-3 py-2 disabled:opacity-50"
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
                  {s.lastHealthOk === null
                    ? "健康检测：-"
                    : s.lastHealthOk
                      ? `✅ ${parseLatencyMs(s.lastHealthMsg) !== null ? `${parseLatencyMs(s.lastHealthMsg)}ms` : "延迟未知"}`
                      : `❌ ${s.lastHealthMsg || "检测失败"}`}
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
                      let ms: string | number = "-";
                      try {
                        const j = JSON.parse(txt);
                        ms = j?.ms ?? "-";
                      } catch {}
                      alert(`测试成功（延迟 ${ms}ms）`);
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
                    setUsersQ("");
                    setUsersPage(1);
                    setUsersPageSize(10);
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
                  onClick={async () => {
                    setModal({
                      open: true,
                      id: s.id,
                      name: s.name,
                      baseUrl: s.baseUrl,
                      apiKey: "",
                      enabled: true,
                      showApiKey: false,
                      loadingApiKey: true,
                    });
                    try {
                      const res = await fetch(`/api/admin/emby-servers/${s.id}`, { cache: "no-store" });
                      const json = await res.json().catch(() => null);
                      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
                      setModal({
                        open: true,
                        id: s.id,
                        name: s.name,
                        baseUrl: s.baseUrl,
                        apiKey: json?.server?.apiKey || "",
                        enabled: true,
                        showApiKey: false,
                        loadingApiKey: false,
                      });
                    } catch (e: any) {
                      setModal((prev) => (prev.open ? { ...prev, loadingApiKey: false } : prev));
                      alert(`读取 API Key 失败: ${e?.message ?? "load_failed"}`);
                    }
                  }}
                >
                  编辑
                </button>

                {/* 服务器默认常驻启用，移除启用/禁用按钮 */}

                <button
                  className="border rounded px-3 py-2 text-red-600"
                  onClick={async () => {
                    if (!(await (window as any).showConfirm(`确定删除服务器：${s.name} ?`))) return;
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
          <div className="bg-white rounded-lg w-full max-w-5xl p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{usersModal.name} - 用户列表</div>
              <button
                className="text-sm underline"
                onClick={() => {
                  setUsersModal({ open: false });
                }}
              >
                关闭
              </button>
            </div>

            {usersModal.loading ? <div className="mt-3 text-sm text-gray-500">加载中…</div> : null}
            {usersModal.error ? <pre className="mt-3 text-xs text-red-600 whitespace-pre-wrap">{usersModal.error}</pre> : null}

            {!usersModal.loading ? (
              <UsersTable
                serverId={usersModal.id}
                users={usersModal.users}
                q={usersQ}
                setQ={setUsersQ}
                page={usersPage}
                setPage={setUsersPage}
                pageSize={usersPageSize}
                setPageSize={setUsersPageSize}
                onRefresh={async () => { 
                  if (!usersModal.open) return;
                  setUsersModal({ ...usersModal, loading: true, error: null });
                  try {
                    const res = await fetch(`/api/admin/emby-servers/${usersModal.id}/users`, { cache: "no-store" });
                    const json = await res.json().catch(() => null);
                    if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
                    setUsersModal({ ...usersModal, loading: false, users: json.users ?? [], error: null });
                  } catch (e: any) {
                    setUsersModal({ ...usersModal, loading: false, users: [], error: e?.message ?? "load_failed" });
                  }
                }}
              />
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
                <label className="text-sm">API Key</label>
                <div className="mt-1 relative">
                  <input
                    type={modal.showApiKey ? "text" : "password"}
                    className="w-full border rounded px-3 py-2 pr-16"
                    value={modal.apiKey}
                    onChange={(e) => setModal({ ...modal, apiKey: e.target.value })}
                    disabled={modal.loadingApiKey}
                    placeholder={modal.loadingApiKey ? "API Key 加载中..." : "请输入 API Key"}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs border rounded px-2 py-1 bg-white"
                    onClick={() => setModal({ ...modal, showApiKey: !modal.showApiKey })}
                    disabled={modal.loadingApiKey}
                  >
                    {modal.showApiKey ? "隐藏" : "显示"}
                  </button>
                </div>
              </div>
              {/* 服务器始终启用：编辑弹窗不提供启用开关 */}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="bg-gray-700 text-white rounded px-3 py-2"
                onClick={async () => {
                  if (modal.apiKey.trim().length < 10) {
                    alert("API Key 长度至少 10 位");
                    return;
                  }

                  const payload: any = {
                    name: modal.name,
                    baseUrl: modal.baseUrl,
                    apiKey: modal.apiKey.trim(),
                  };

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
              <button className="border bg-white rounded px-3 py-2" onClick={() => setModal({ open: false })}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
