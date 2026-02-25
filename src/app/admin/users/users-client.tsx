"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type EmbyServerOption = { id: string; name: string; enabled: boolean };
type PlanOption = { id: string; name: string };

type UserRow = {
  id: string;
  username: string;
  email: string | null;
  role: "USER" | "ADMIN";
  enabled: boolean;
  expiryReminderEnabled?: boolean;
  balance: number | null;
  subscriptionStatus: string | null;
  planId?: string | null;
  planName: string | null;
  servers: Array<{
    embyServerId: string;
    name: string;
    baseUrl: string;
    status: "ACTIVE" | "DISABLED" | "CONFLICT";
    assignedAt: string | null;
  }>;
  serverCount?: number;
  serverOnlineCount?: number;
  serverHasConflict?: boolean;
  endAt: string | null;
  createdAt: string;
};

type EditState =
  | { open: false }
  | {
      open: true;
      id: string;
      loading: boolean;
      error: string | null;
      username: string;
      email: string;
      changePassword: boolean;
      newPassword: string;
      role: "USER" | "ADMIN";
      balance: string;
      expiryReminderEnabled: boolean;
      enabled: boolean;
      // subscription
      planId: string;
      startAt: string;
      endAt: string;
      servers: Array<{ id: string; name: string }>;
      plans: Array<{ id: string; name: string }>;
    };

function avatarColor(username: string) {
  const palette = [
    "bg-cyan-500",
    "bg-violet-500",
    "bg-emerald-500",
    "bg-rose-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-pink-500",
    "bg-teal-500",
    "bg-indigo-500",
    "bg-orange-500",
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function dash(v: any) {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function formatDateYmdShanghai(v: any) {
  if (v === null || v === undefined || v === "") return "-";
  const ms = new Date(v).getTime();
  if (!Number.isFinite(ms)) return "-";
  const sh = new Date(ms + 8 * 60 * 60 * 1000);
  const y = sh.getUTCFullYear();
  const m = String(sh.getUTCMonth() + 1).padStart(2, "0");
  const d = String(sh.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isValidYmd(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function parseYmd(v: string): Date | null {
  if (!isValidYmd(v)) return null;
  return new Date(v + "T00:00:00.000Z");
}

function ymdFromUtcDate(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function serverBadgeText(r: UserRow) {
  const total = r.serverCount ?? r.servers?.length ?? 0;
  const online = r.serverOnlineCount ?? (r.servers ?? []).filter((x) => x.status === "ACTIVE").length;
  return `${total}台服务器（${online}在线）`;
}

export function UsersClient() {
  const [q, setQ] = useState("");
  const [filterPlanId, setFilterPlanId] = useState("");
  const [filterSubStatus, setFilterSubStatus] = useState<"" | "valid" | "expired" | "none">("");
  const [filterPlans, setFilterPlans] = useState<PlanOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<UserRow[]>([]);

  const [edit, setEdit] = useState<EditState>({ open: false });

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  const [createOpen, setCreateOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkAddDays, setBulkAddDays] = useState("30");
  const [bulkAddLoading, setBulkAddLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSyncEmby, setDeleteSyncEmby] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importServers, setImportServers] = useState<EmbyServerOption[]>([]);
  const [importPlans, setImportPlans] = useState<PlanOption[]>([]);
  const [importServerId, setImportServerId] = useState("");
  const [importDefaultPassword, setImportDefaultPassword] = useState("");
  const [importPlanId, setImportPlanId] = useState("");
  const [importStartAt, setImportStartAt] = useState("");
  const [importEndAt, setImportEndAt] = useState("");
  const [importMode, setImportMode] = useState<"ALL" | "SELECTED">("ALL");
  const [importNamesText, setImportNamesText] = useState("");
  const [importEmbyUsers, setImportEmbyUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [importEmbyUsersLoaded, setImportEmbyUsersLoaded] = useState(false);
  const [importSelectedEmbyUsers, setImportSelectedEmbyUsers] = useState<Record<string, boolean>>({});
  const [openServerDetailUserId, setOpenServerDetailUserId] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"USER" | "ADMIN">("USER");
  const [newBalance, setNewBalance] = useState("0");

  const canCreate = useMemo(() => {
    if (!newUsername.trim()) return false;
    if (newPassword.length < 6) return false;
    const b = Number(newBalance);
    if (!Number.isFinite(b) || b < 0) return false;
    return true;
  }, [newUsername, newPassword, newBalance]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(window.location.origin + "/api/admin/users");
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (filterPlanId) url.searchParams.set("planId", filterPlanId);
      if (filterSubStatus) url.searchParams.set("subStatus", filterSubStatus);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
      setRows(json.users ?? []);
      // prune selection after refresh
      setSelected((m) => {
        const next: Record<string, boolean> = {};
        const valid = new Set((json.users ?? []).map((u: any) => u.id));
        for (const [k, v] of Object.entries(m)) if (v && valid.has(k)) next[k] = true;
        return next;
      });
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

  useEffect(() => {
    // load plan options for filter
    fetch("/api/admin/plans", { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j, status: r.status })))
      .then(({ ok, j, status }) => {
        if (!ok) throw new Error(j?.error ? JSON.stringify(j) : `HTTP ${status}`);
        setFilterPlans((j?.plans ?? []).map((p: any) => ({ id: p.id, name: p.name })));
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!moreOpen) return;
      const target = e.target as Node;
      if (!moreRef.current?.contains(target)) setMoreOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!edit.open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [edit.open]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!openServerDetailUserId) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-server-popover-root='1']")) return;
      setOpenServerDetailUserId(null);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenServerDetailUserId(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openServerDetailUserId]);

  async function openImportModal() {
    setImportOpen(true);
    setImportError(null);
    setImportLoading(true);
    setImportEmbyUsers([]);
    setImportEmbyUsersLoaded(false);
    setImportSelectedEmbyUsers({});
    try {
      const [sRes, pRes] = await Promise.all([
        fetch("/api/admin/emby-servers", { cache: "no-store" }),
        fetch("/api/admin/plans", { cache: "no-store" }),
      ]);
      const sJson = await sRes.json().catch(() => null);
      const pJson = await pRes.json().catch(() => null);
      if (!sRes.ok) throw new Error(sJson?.error ? JSON.stringify(sJson) : `HTTP ${sRes.status}`);
      if (!pRes.ok) throw new Error(pJson?.error ? JSON.stringify(pJson) : `HTTP ${pRes.status}`);

      setImportServers((sJson.servers ?? []).filter((x: any) => x.enabled));
      setImportPlans((pJson.plans ?? []).filter((x: any) => x.enabled).map((x: any) => ({ id: x.id, name: x.name })));

      const today = new Date().toISOString().slice(0, 10);
      if (!importStartAt) setImportStartAt(today);
      if (!importEndAt) setImportEndAt(today);

      if (!importServerId && (sJson.servers ?? []).length) setImportServerId((sJson.servers ?? [])[0]?.id ?? "");
    } catch (e: any) {
      setImportError(e?.message ?? "load_failed");
    } finally {
      setImportLoading(false);
    }
  }

  const importSelectedIds = useMemo(() => Object.keys(importSelectedEmbyUsers).filter((id) => importSelectedEmbyUsers[id]), [importSelectedEmbyUsers]);

  async function loadEmbyUserListForImport() {
    if (!importServerId) {
      alert("请先选择 Emby 服务器");
      return;
    }
    setImportLoading(true);
    setImportError(null);
    try {
      const res = await fetch(`/api/admin/emby-servers/${importServerId}/users`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);

      const list = (json.users ?? [])
        .map((u: any) => ({ id: String(u.id), name: String(u.name), isAdmin: !!u?.policy?.isAdministrator }))
        .filter((u: any) => !u.isAdmin && String(u.name || "").trim().toLowerCase() !== "atemplate")
        .map((u: any) => ({ id: u.id, name: u.name }));
      setImportEmbyUsers(list);
      setImportEmbyUsersLoaded(true);
      setImportSelectedEmbyUsers({});
    } catch (e: any) {
      setImportError(e?.message ?? "load_users_failed");
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="w-full md:w-72 border rounded px-3 py-2"
            placeholder="搜索用户/邮箱"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select className="border rounded px-3 py-2" value={filterPlanId} onChange={(e) => setFilterPlanId(e.target.value)}>
            <option value="">选择订阅计划</option>
            {filterPlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select className="border rounded px-3 py-2" value={filterSubStatus} onChange={(e) => setFilterSubStatus(e.target.value as any)}>
            <option value="">选择订阅状态</option>
            <option value="valid">有效</option>
            <option value="expired">已过期</option>
            <option value="none">无订阅</option>
          </select>

          <button className="border rounded px-3 py-2" onClick={refresh}>
            查询
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <button className="bg-blue-600 text-white rounded px-3 py-2" onClick={() => setCreateOpen(true)}>
            + 创建用户
          </button>

          <div ref={moreRef} className="relative">
            <button className="cursor-pointer select-none border rounded px-3 py-2" onClick={() => setMoreOpen((v) => !v)}>
              更多 ▾
            </button>
            {moreOpen ? (
              <div className="absolute right-0 mt-2 w-56 bg-white border rounded shadow p-2 text-sm space-y-1 z-10">
                <button
                  className="w-full text-left px-2 py-2 hover:bg-gray-50 rounded"
                  onClick={(e) => {
                    setMoreOpen(false);
                    (document.activeElement as any)?.blur?.();
                    openImportModal().catch((err) => alert(err?.message ?? String(err)));
                  }}
                >
                  从 Emby 导入用户
                </button>

                <button
                  className="w-full text-left px-2 py-2 hover:bg-gray-50 rounded disabled:opacity-50"
                  disabled={!selectedIds.length}
                  onClick={() => {
                    setMoreOpen(false);
                    setBulkAddDays("30");
                    setBulkAddOpen(true);
                  }}
                >
                  批量增加订阅时间
                </button>

                <button
                  className="w-full text-left px-2 py-2 hover:bg-red-50 text-red-600 rounded disabled:opacity-50"
                  disabled={!selectedIds.length}
                  onClick={async () => {
                    setMoreOpen(false);
                    if (!(await (window as any).showConfirm(`确定批量删除所选用户？
将同步删除 Emby 服务器对应用户。
数量：${selectedIds.length}`))) return;

                    const res = await fetch("/api/admin/users/bulk-delete", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ ids: selectedIds }),
                    });
                    const json = await res.json().catch(() => null);
                    if (!res.ok) {
                      alert(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
                      return;
                    }

                    const failed = (json.results ?? []).filter((r: any) => !r.ok);
                    if (failed.length) {
                      alert(`批量删除完成，但有失败：${failed.length} 个。\n` + failed.map((x: any) => `${x.id}: ${x.status ?? ""} ${x.error ?? ""}`).join("\n"));
                    } else {
                      alert("批量删除成功");
                    }

                    setSelected({});
                    await refresh();
                  }}
                >
                  批量删除
                </button>
              </div>
            ) : null}
          </div>

          <div className="text-xs text-gray-500">已选 {selectedIds.length} 个</div>
        </div>
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="overflow-x-auto overflow-y-visible bg-white">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="text-left text-gray-600 border-y bg-white">
            <tr>
              <th className="py-2 px-3">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selectedIds.length === rows.length}
                  onChange={(e) => {
                    const on = e.target.checked;
                    if (!on) {
                      setSelected({});
                      return;
                    }
                    const next: Record<string, boolean> = {};
                    for (const r of rows) next[r.id] = true;
                    setSelected(next);
                  }}
                />
              </th>
              <th className="py-2 px-3">用户</th>
              <th className="py-2 px-3">邮箱</th>
              <th className="py-2 px-3">状态</th>
              <th className="py-2 px-3">余额</th>
              <th className="py-2 px-3">订阅状态</th>
              <th className="py-2 px-3">订阅计划</th>
              <th className="py-2 px-3">服务器分配</th>
              <th className="py-2 px-3">到期时间</th>
              <th className="py-2 px-3">创建时间</th>
              <th className="py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="py-2 px-3">
                  <input
                    type="checkbox"
                    checked={!!selected[r.id]}
                    onChange={(e) => setSelected((m) => ({ ...m, [r.id]: e.target.checked }))}
                  />
                </td>
                <td className="py-2 px-3 font-mono">
                  <span className="inline-flex items-center gap-2">
                    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${avatarColor(r.username)} text-white text-xs font-semibold select-none`}>
                      {(r.username || "?").slice(0, 2).toUpperCase()}
                    </span>
                    {r.role === "ADMIN" ? <span title="管理员">👑</span> : null}
                    <span>{r.username}</span>
                  </span>
                </td>
                <td className="py-2 px-3">{dash(r.email)}</td>
                <td className="py-2 px-3">
                  {r.enabled ? (
                    <span className="inline-flex items-center rounded border border-green-200 bg-green-50 text-green-700 px-2 py-0.5 text-xs font-medium">启用</span>
                  ) : (
                    <span className="inline-flex items-center rounded border border-gray-300 bg-gray-50 text-gray-600 px-2 py-0.5 text-xs font-medium">禁用</span>
                  )}
                </td>
                <td className="py-2 px-3">{dash(r.balance)}</td>
                <td className="py-2 px-3">
                  {r.subscriptionStatus && (r.subscriptionStatus === "有效" || r.subscriptionStatus === "ACTIVE") ? (
                    <span className="inline-flex items-center rounded border border-green-200 bg-green-50 text-green-700 px-2 py-0.5 text-xs font-medium">有效</span>
                  ) : r.subscriptionStatus && (r.subscriptionStatus === "已过期" || r.subscriptionStatus === "EXPIRED") ? (
                    <span className="inline-flex items-center rounded border border-red-200 bg-red-50 text-red-600 px-2 py-0.5 text-xs font-medium">已过期</span>
                  ) : (
                    <span className="inline-flex items-center rounded border border-gray-300 bg-gray-50 text-gray-600 px-2 py-0.5 text-xs font-medium">{dash(r.subscriptionStatus)}</span>
                  )}
                </td>
                <td className="py-2 px-3">{dash(r.planName)}</td>
                <td className="py-2 px-3">
                  {r.servers?.length ? (
                    <div className="relative inline-block" data-server-popover-root="1">
                      <button
                        type="button"
                        className={
                          "inline-flex items-center rounded border px-2.5 py-1 text-sm " +
                          (r.serverHasConflict ? "border-amber-300 text-amber-700 bg-amber-50" : "border-gray-300 text-gray-800")
                        }
                        onClick={() => setOpenServerDetailUserId((prev) => (prev === r.id ? null : r.id))}
                      >
                        {serverBadgeText(r)}
                      </button>
                      {openServerDetailUserId === r.id ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-[320px] rounded-xl border bg-white p-3 shadow-xl">
                          <div className="space-y-2 max-h-[360px] overflow-auto">
                            {r.servers.map((sv) => (
                              <div key={sv.embyServerId} className="border-b last:border-b-0 pb-2 last:pb-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={
                                      "inline-block h-2.5 w-2.5 rounded-full " +
                                      (sv.status === "ACTIVE" ? "bg-green-500" : sv.status === "DISABLED" ? "bg-red-500" : "bg-amber-500")
                                    }
                                  />
                                  <span className="font-semibold">{sv.name}</span>
                                  {sv.status === "DISABLED" ? <span className="text-xs rounded border border-red-200 bg-red-50 text-red-600 px-2 py-0.5">已禁用</span> : null}
                                  {sv.status === "CONFLICT" ? <span className="text-xs rounded border border-amber-200 bg-amber-50 text-amber-700 px-2 py-0.5">同名用户</span> : null}
                                </div>
                                <div className="text-sm text-gray-600 mt-1">{sv.baseUrl}</div>
                                <div className="text-sm text-gray-500 mt-1">分配时间：{formatDateYmdShanghai(sv.assignedAt)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="py-2 px-3 font-mono text-xs">{formatDateYmdShanghai(r.endAt)}</td>
                <td className="py-2 px-3 font-mono text-xs">{formatDateYmdShanghai(r.createdAt)}</td>
                <td className="py-2 px-3">
                  <button
                    className="border rounded px-2 py-1"
                    onClick={async () => {
                      setEdit({
                        open: true,
                        id: r.id,
                        loading: true,
                        error: null,
                        username: r.username,
                        email: r.email ?? "",
                        changePassword: false,
                        newPassword: "",
                        role: r.role,
                        balance: String(r.balance ?? 0),
                        expiryReminderEnabled: !!r.expiryReminderEnabled,
                        enabled: r.enabled,
                        planId: "",
                        startAt: new Date().toISOString().slice(0, 10),
                        endAt: new Date().toISOString().slice(0, 10),
                        servers: [],
                        plans: [],
                      });
                      try {
                        const res = await fetch(`/api/admin/users/${r.id}`, { cache: "no-store" });
                        const json = await res.json().catch(() => null);
                        if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);

                        const u = json.user;
                        const sub = u.subscriptions?.[0] ?? null;

                        setEdit({
                          open: true,
                          id: r.id,
                          loading: false,
                          error: null,
                          username: u.username,
                          email: u.email ?? "",
                          changePassword: false,
                          newPassword: "",
                          role: u.role,
                          balance: String((u.balanceCents ?? 0) / 100),
                          expiryReminderEnabled: !!u.expiryReminderEnabled,
                          enabled: !!u.enabled,
                          planId: sub?.planId ?? "",
                          startAt: sub?.startAt ? String(sub.startAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
                          endAt: sub?.endAt ? String(sub.endAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
                          servers: json.servers ?? [],
                          plans: (json.plans ?? []).map((p: any) => ({ id: p.id, name: p.name })),
                        });
                      } catch (e: any) {
                        setEdit((prev: any) => ({ ...prev, loading: false, error: e?.message ?? "load_failed" }));
                      }
                    }}
                  >
                    编辑
                  </button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td className="py-6 px-3 text-gray-500" colSpan={11}>
                  无数据
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {edit.open ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 overflow-y-auto overscroll-contain z-50">
          <div className="bg-white rounded-lg w-full max-w-[470px] p-4 max-h-[90vh] overflow-y-auto">
            <div className="font-semibold">编辑用户</div>

            {edit.loading ? <div className="mt-3 text-sm text-gray-500">加载中…</div> : null}
            {edit.error ? <pre className="mt-3 text-xs text-red-600 whitespace-pre-wrap">{edit.error}</pre> : null}

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="text-sm">用户名</label>
                  <input className="mt-1 w-full border rounded px-3 py-2 bg-gray-50" value={edit.username} disabled />
                </div>
                <div>
                  <label className="text-sm">邮箱</label>
                  <input className="mt-1 w-full border rounded px-3 py-2" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm">修改密码</label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={edit.changePassword}
                      onChange={(e) => setEdit({ ...edit, changePassword: e.target.checked })}
                    />
                    <span className="text-sm">是</span>
                  </div>
                  {edit.changePassword ? (
                    <input
                      className="mt-2 w-full border rounded px-3 py-2"
                      type="password"
                      placeholder="新密码（>=6位）"
                      value={edit.newPassword}
                      onChange={(e) => setEdit({ ...edit, newPassword: e.target.value })}
                    />
                  ) : null}
                </div>
                <div>
                  <label className="text-sm">角色（面板）</label>
                  <select className="mt-1 w-full border rounded px-3 py-2" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as any })}>
                    <option value="ADMIN">管理员</option>
                    <option value="USER">用户</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm">账户余额</label>
                  <input className="mt-1 w-full border rounded px-3 py-2" value={edit.balance} onChange={(e) => setEdit({ ...edit, balance: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="expiryReminder"
                    type="checkbox"
                    checked={edit.expiryReminderEnabled}
                    onChange={(e) => setEdit({ ...edit, expiryReminderEnabled: e.target.checked })}
                  />
                  <label htmlFor="expiryReminder" className="text-sm">
                    到期提醒
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input id="enabled" type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} />
                  <label htmlFor="enabled" className="text-sm">
                    用户状态（启用）
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="font-medium">订阅信息</div>

                <div>
                  <label className="text-sm">订阅计划</label>
                  <select
                    className="mt-1 w-full border rounded px-3 py-2"
                    value={edit.planId}
                    onChange={(e) => setEdit({ ...edit, planId: e.target.value })}
                  >
                    <option value="">-</option>
                    {edit.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-gray-500 mt-1">可不选计划，仅在面板记录订阅时间（不下发Emby分配）。</div>
                </div>

                <div>
                  <label className="text-sm">订阅开始日期</label>
                  <input
                    className="mt-1 w-full border rounded px-3 py-2"
                    type="text"
                    placeholder="YYYY-MM-DD"
                    value={edit.startAt}
                    onChange={(e) => setEdit({ ...edit, startAt: e.target.value.trim() })}
                  />
                </div>

                <div>
                  <label className="text-sm">订阅结束日期</label>
                  <input
                    className="mt-1 w-full border rounded px-3 py-2"
                    type="text"
                    placeholder="YYYY-MM-DD"
                    value={edit.endAt}
                    onChange={(e) => setEdit({ ...edit, endAt: e.target.value.trim() })}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                className="bg-gray-700 text-white rounded px-3 py-2 disabled:opacity-50"
                disabled={edit.loading}
                onClick={async () => {
                  const balanceNum = Number(edit.balance);
                  if (!Number.isFinite(balanceNum) || balanceNum < 0) {
                    alert("余额格式不正确");
                    return;
                  }

                  const payload: any = {
                    email: edit.email.trim() ? edit.email.trim() : null,
                    role: edit.role,
                    enabled: edit.enabled,
                    expiryReminderEnabled: edit.expiryReminderEnabled,
                    balanceCents: Math.round(balanceNum * 100),
                    changePassword: edit.changePassword,
                    ...(edit.changePassword ? { newPassword: edit.newPassword } : {}),
                  };

                  if (!isValidYmd(edit.startAt) || !isValidYmd(edit.endAt)) {
                    alert("订阅日期格式不正确，请使用 YYYY-MM-DD");
                    return;
                  }
                  if (edit.endAt < edit.startAt) {
                    alert("订阅结束时间不可以早于订阅开始时间");
                    return;
                  }

                  payload.subscription = {
                    planId: edit.planId || null,
                    payCycle: null,
                    startAt: new Date(edit.startAt + "T00:00:00.000Z").toISOString(),
                    endAt: new Date(edit.endAt + "T00:00:00.000Z").toISOString(),
                  };

                  const res = await fetch(`/api/admin/users/${edit.id}`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  const text = await res.text();
                  let body: any = null;
                  try {
                    body = JSON.parse(text);
                  } catch {}
                  if (!res.ok) {
                    let msg = text;
                    if (body?.error === "cannot_demote_last_admin") {
                      msg = "面板至少需要保留一位管理员";
                    } else if (body?.error) {
                      msg = String(body.error);
                    }
                    alert(`保存失败: ${msg}`);
                    return;
                  }
                  if (body?.warn === "emby_name_conflict" && Array.isArray(body?.nameConflicts) && body.nameConflicts.length) {
                    alert("已保存，但部分目标服务器存在同名用户，未自动创建：\n" + body.nameConflicts.map((x: any) => `- ${x.serverName}`).join("\n"));
                  }
                  setEdit({ open: false });
                  await refresh();
                }}
              >
                更新用户
              </button>
              <button className="border bg-white rounded px-3 py-2" onClick={() => setEdit({ open: false })}>
                取消
              </button>
              <button
                className={
                  "border bg-white rounded px-3 py-2 ml-auto " +
                  (edit.role === "ADMIN" ? "text-gray-400 border-gray-300 bg-gray-100 cursor-not-allowed" : "text-red-600")
                }
                disabled={edit.role === "ADMIN"}
                title={edit.role === "ADMIN" ? "面板管理员账户不可删除" : ""}
                onClick={() => {
                  if (edit.role === "ADMIN") return;
                  setDeleteSyncEmby(true);
                  setDeleteConfirmOpen(true);
                }}
              >
                删除用户
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmOpen && edit.open ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-2 z-[60]">
          <div className="bg-white rounded-lg w-full max-w-md p-2 border shadow-lg">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">删除用户</div>
              <button className="text-lg text-gray-400 hover:text-gray-700" onClick={() => setDeleteConfirmOpen(false)}>
                ×
              </button>
            </div>

            <div className="mt-2 text-sm font-medium">确定要删除这个用户吗？</div>
            <div className="mt-2 text-lg text-red-500 font-semibold">此操作将永久删除用户，不可恢复！</div>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={deleteSyncEmby}
                onChange={(e) => setDeleteSyncEmby(e.target.checked)}
              />
              同步删除所有Emby服务器上的对应用户
            </label>

            <div className="mt-3 flex justify-end gap-2">
              <button className="border bg-white rounded px-3 py-1 text-sm" disabled={deleteLoading} onClick={() => setDeleteConfirmOpen(false)}>
                取消
              </button>
              <button
                className="bg-gray-700 text-white rounded px-3 py-1 text-sm disabled:opacity-60"
                disabled={deleteLoading}
                onClick={async () => {
                  setDeleteLoading(true);
                  try {
                    const res = await fetch(`/api/admin/users/${edit.id}/delete`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ syncDeleteEmby: deleteSyncEmby }),
                    });
                    const txt = await res.text();
                    if (!res.ok) {
                      alert(`删除失败: ${txt}`);
                      return;
                    }
                    setDeleteConfirmOpen(false);
                    setEdit({ open: false });
                    await refresh();
                  } finally {
                    setDeleteLoading(false);
                  }
                }}
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkAddOpen ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl p-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="font-semibold text-lg">为 {selectedIds.length} 个选中用户添加订阅时间</div>
              <button className="text-sm underline" onClick={() => setBulkAddOpen(false)}>
                关闭
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">
                <span className="text-red-500 mr-1">*</span> 添加天数
              </label>
              <div className="flex w-full">
                <input
                  className="flex-1 border rounded-l px-3 py-2"
                  value={bulkAddDays}
                  onChange={(e) => setBulkAddDays(e.target.value)}
                />
                <div className="border border-l-0 rounded-r px-4 py-2 bg-gray-50">天</div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-gray-800">
              <div className="font-semibold mb-1">操作说明</div>
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>将为 {selectedIds.length} 个选中用户添加订阅时间</li>
                <li>只处理有订阅的用户</li>
                <li>永久订阅用户将被自动跳过</li>
                <li>更新后将自动同步到Emby服务器</li>
              </ul>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                className="bg-gray-700 text-white rounded px-3 py-2 disabled:opacity-50"
                disabled={bulkAddLoading}
                onClick={async () => {
                  const addDays = Number(bulkAddDays);
                  if (!Number.isFinite(addDays) || addDays <= 0) {
                    alert("天数不合法");
                    return;
                  }
                  setBulkAddLoading(true);
                  try {
                    for (const id of selectedIds) {
                      const dRes = await fetch(`/api/admin/users/${id}`, { cache: "no-store" });
                      const dJson = await dRes.json().catch(() => null);
                      if (!dRes.ok) continue;
                      const sub = dJson?.user?.subscriptions?.[0];
                      if (!sub?.endAt || !sub?.planId) continue;
                      const end = new Date(sub.endAt);
                      const nextEnd = new Date(end.getTime() + addDays * 24 * 60 * 60 * 1000);
                      await fetch(`/api/admin/users/${id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ subscription: { planId: sub.planId, payCycle: null, startAt: sub.startAt, endAt: nextEnd.toISOString() } }),
                      });
                    }
                    alert("批量增加订阅时间已提交（逐个更新）");
                    setBulkAddOpen(false);
                    await refresh();
                  } finally {
                    setBulkAddLoading(false);
                  }
                }}
              >
                开始处理
              </button>
              <button className="border bg-white rounded px-3 py-2" disabled={bulkAddLoading} onClick={() => setBulkAddOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-xl p-4 space-y-4 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between">
              <div className="font-semibold">从 Emby 服务器导入用户</div>
              <div />
            </div>

            {importLoading ? <div className="text-sm text-gray-500">加载中…</div> : null}
            {importError ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{importError}</pre> : null}

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-sm">选择 Emby 服务器 *</label>
                <select className="mt-1 w-full border rounded px-3 py-2" value={importServerId} onChange={(e) => setImportServerId(e.target.value)}>
                  <option value="">选择服务器…</option>
                  {importServers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm">默认密码 *（导入后面板账户使用该密码；不会重置 Emby 原密码）</label>
                <input
                  className="mt-1 w-full border rounded px-3 py-2"
                  type="password"
                  value={importDefaultPassword}
                  onChange={(e) => setImportDefaultPassword(e.target.value)}
                  placeholder="至少 6 位"
                />
              </div>

              <div>
                <label className="text-sm">分配订阅计划（可选）</label>
                <select
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={importPlanId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setImportPlanId(v);
                  }}
                >
                  <option value="">不分配</option>
                  {importPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {importPlanId ? (
                <>
                  <div>
                    <label className="text-sm">订阅开始日期 *</label>
                    <input
                      className="mt-1 w-full border rounded px-3 py-2"
                      type="text"
                      placeholder="YYYY-MM-DD"
                      value={importStartAt}
                      onChange={(e) => setImportStartAt(e.target.value.trim())}
                    />
                  </div>

                  <div>
                    <label className="text-sm">订阅结束日期 *</label>
                    <input
                      className="mt-1 w-full border rounded px-3 py-2"
                      type="text"
                      placeholder="YYYY-MM-DD"
                      value={importEndAt}
                      onChange={(e) => setImportEndAt(e.target.value.trim())}
                    />
                  </div>

                  {importStartAt && importEndAt && importStartAt >= importEndAt ? (
                    <div className="text-sm text-red-600">订阅开始日期必须早于订阅结束日期</div>
                  ) : null}
                </>
              ) : null}

              <div>
                <label className="text-sm">导入模式</label>
                <div className="mt-2 flex gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="importMode" checked={importMode === "ALL"} onChange={() => setImportMode("ALL")} />
                    导入全部用户
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="importMode" checked={importMode === "SELECTED"} onChange={() => setImportMode("SELECTED")} />
                    选择特定用户
                  </label>
                </div>
              </div>

              {importMode === "SELECTED" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <button className="border rounded px-3 py-2" type="button" onClick={loadEmbyUserListForImport} disabled={importLoading || !importServerId}>
                      加载 Emby 用户列表
                    </button>
                    <div className="text-xs text-gray-600">已选择 {importSelectedIds.length}/{importEmbyUsers.length} 个用户</div>
                  </div>

                  {!importEmbyUsersLoaded ? (
                    <div className="bg-sky-50 border border-sky-200 rounded p-3 text-sm text-sky-900">
                      请先加载用户列表。点击上方的“加载 Emby 用户列表”按钮来查看和选择要导入的用户。
                    </div>
                  ) : (
                    <div className="border rounded overflow-hidden">
                      <div className="max-h-[520px] overflow-auto">
                        <table className="min-w-[520px] w-full text-sm">
                        <thead className="text-left text-gray-600 border-b sticky top-0 bg-white">
                          <tr>
                            <th className="py-2 px-3">
                              <input
                                type="checkbox"
                                checked={importEmbyUsers.length > 0 && importSelectedIds.length === importEmbyUsers.length}
                                onChange={(e) => {
                                  const on = e.target.checked;
                                  if (!on) {
                                    setImportSelectedEmbyUsers({});
                                    return;
                                  }
                                  const next: Record<string, boolean> = {};
                                  for (const u of importEmbyUsers) next[u.id] = true;
                                  setImportSelectedEmbyUsers(next);
                                }}
                              />
                            </th>
                            <th className="py-2 px-3">用户名</th>
                            <th className="py-2 px-3">Emby 用户ID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importEmbyUsers.map((u) => (
                            <tr key={u.id} className="border-b last:border-b-0">
                              <td className="py-2 px-3">
                                <input
                                  type="checkbox"
                                  checked={!!importSelectedEmbyUsers[u.id]}
                                  onChange={(e) => setImportSelectedEmbyUsers((m) => ({ ...m, [u.id]: e.target.checked }))}
                                />
                              </td>
                              <td className="py-2 px-3 font-mono">{u.name}</td>
                              <td className="py-2 px-3 font-mono text-xs">{u.id}</td>
                            </tr>
                          ))}
                          {!importEmbyUsers.length ? (
                            <tr>
                              <td className="py-6 px-3 text-gray-500" colSpan={3}>
                                无可用用户
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-sm">（可选）手动指定用户名（每行一个，和勾选列表取并集）</label>
                    <textarea className="mt-1 w-full border rounded px-3 py-2 min-h-[100px]" value={importNamesText} onChange={(e) => setImportNamesText(e.target.value)} />
                  </div>
                </div>
              ) : null}

              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-900 space-y-1">
                <div className="font-medium">导入提示</div>
                <ul className="list-disc pl-5 text-xs text-yellow-900">
                  <li>将导入 Emby 服务器上的所有非管理员用户及模板用户（如选择特定用户，则只导入指定用户名）。</li>
                  <li>如果用户已存在于面板，将跳过创建；但会尝试补齐 EmbyUserLink。</li>
                  <li>不会重置 Emby 服务器中用户的密码；仅面板侧使用默认密码。</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button className="border bg-white rounded px-3 py-2" onClick={() => setImportOpen(false)}>
                取消
              </button>
              <button
                className="bg-gray-700 text-white rounded px-3 py-2 disabled:opacity-50"
                disabled={
                  !importServerId ||
                  importDefaultPassword.trim().length < 6 ||
                  importLoading ||
                  (importMode === "SELECTED" && importSelectedIds.length === 0 && importNamesText.trim().length === 0) ||
                  (importPlanId ? !importStartAt || !importEndAt || importStartAt >= importEndAt : false)
                }
                onClick={async () => {
                  setImportLoading(true);
                  setImportError(null);
                  try {
                    const usernamesFromText =
                      importMode === "SELECTED"
                        ? importNamesText
                            .split(/\r?\n/)
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : [];

                    const usernamesFromChecked = importMode === "SELECTED" ? importSelectedIds.map((id) => importEmbyUsers.find((u) => u.id === id)?.name).filter(Boolean) : [];

                    const usernames =
                      importMode === "SELECTED"
                        ? Array.from(new Set([...usernamesFromChecked, ...usernamesFromText].map((s) => String(s).trim()).filter(Boolean)))
                        : null;

                    const res = await fetch("/api/admin/users/import-from-emby", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        embyServerId: importServerId,
                        defaultPassword: importDefaultPassword,
                        planId: importPlanId || null,
                        payCycle: importPlanId ? "YEARLY" : null,
                        startAt: importPlanId ? new Date(importStartAt + "T00:00:00.000Z").toISOString() : null,
                        endAt: importPlanId ? new Date(importEndAt + "T00:00:00.000Z").toISOString() : null,
                        mode: importMode,
                        usernames,
                        missingOnly: true,
                        skipAdmins: true,
                      }),
                    });
                    const json = await res.json().catch(() => null);
                    if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);

                    alert(`导入完成：导入=${json.imported}, 跳过=${json.skipped}`);
                    setImportOpen(false);
                    await refresh();
                  } catch (e: any) {
                    setImportError(e?.message ?? "import_failed");
                  } finally {
                    setImportLoading(false);
                  }
                }}
              >
                开始导入
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-lg p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">创建用户（面板用户）</div>
              <div />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <div>
                <label className="text-sm">用户名</label>
                <input className="mt-1 w-full border rounded px-3 py-2" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
              </div>
              <div>
                <label className="text-sm">邮箱（可选）</label>
                <input className="mt-1 w-full border rounded px-3 py-2" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-sm">密码</label>
                <input className="mt-1 w-full border rounded px-3 py-2" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" />
              </div>
              <div>
                <label className="text-sm">是否管理员（面板）</label>
                <select className="mt-1 w-full border rounded px-3 py-2" value={newRole} onChange={(e) => setNewRole(e.target.value as any)}>
                  <option value="USER">否</option>
                  <option value="ADMIN">是</option>
                </select>
              </div>

              <div>
                <label className="text-sm">账户余额</label>
                <div className="mt-1 flex">
                  <div className="border rounded-l px-3 py-2 bg-gray-50 text-gray-600">¥</div>
                  <input
                    className="w-full border-t border-b border-r rounded-r px-3 py-2"
                    value={newBalance}
                    onChange={(e) => setNewBalance(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">创建时可直接充值到该账户（元）。</div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="bg-gray-700 text-white rounded px-3 py-2 disabled:opacity-50"
                disabled={!canCreate}
                onClick={async () => {
                  const balanceNum = Number(newBalance);
                  if (!Number.isFinite(balanceNum) || balanceNum < 0) {
                    alert("账户余额格式不正确");
                    return;
                  }

                  const res = await fetch("/api/admin/users", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      username: newUsername.trim(),
                      email: newEmail.trim(),
                      password: newPassword,
                      role: newRole,
                      balanceCents: Math.round(balanceNum * 100),
                    }),
                  });
                  if (!res.ok) {
                    alert(`创建失败: ${await res.text()}`);
                    return;
                  }
                  setCreateOpen(false);
                  setNewUsername("");
                  setNewEmail("");
                  setNewPassword("");
                  setNewRole("USER");
                  setNewBalance("0");
                  await refresh();
                }}
              >
                创建
              </button>
              <button className="border bg-white rounded px-3 py-2" onClick={() => setCreateOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
