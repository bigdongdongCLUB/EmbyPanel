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
  payCycle: string | null;
  servers: string[];
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
      payCycle: "TRIAL" | "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "TWO_YEARLY";
      startAt: string;
      endAt: string;
      servers: Array<{ id: string; name: string }>;
      plans: Array<{ id: string; name: string }>;
    };

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

  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importServers, setImportServers] = useState<EmbyServerOption[]>([]);
  const [importPlans, setImportPlans] = useState<PlanOption[]>([]);
  const [importServerId, setImportServerId] = useState("");
  const [importDefaultPassword, setImportDefaultPassword] = useState("");
  const [importPlanId, setImportPlanId] = useState("");
  const [importPayCycle, setImportPayCycle] = useState<"" | "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "TWO_YEARLY">("");
  const [importStartAt, setImportStartAt] = useState("");
  const [importEndAt, setImportEndAt] = useState("");
  const [importMode, setImportMode] = useState<"ALL" | "SELECTED">("ALL");
  const [importNamesText, setImportNamesText] = useState("");
  const [importEmbyUsers, setImportEmbyUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [importEmbyUsersLoaded, setImportEmbyUsersLoaded] = useState(false);
  const [importSelectedEmbyUsers, setImportSelectedEmbyUsers] = useState<Record<string, boolean>>({});

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

      const list = (json.users ?? []).map((u: any) => ({ id: String(u.id), name: String(u.name) }));
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
                  onClick={async () => {
                    setMoreOpen(false);
                    const planId = prompt("批量更改订阅计划：请输入 PlanId（在订阅管理页面可看到）");
                    if (!planId) return;
                    const payCycle = prompt("付费周期：MONTHLY/QUARTERLY/HALF_YEARLY/YEARLY/TWO_YEARLY", "YEARLY") || "YEARLY";
                    const startAt = prompt("开始日期(YYYY-MM-DD)", new Date().toISOString().slice(0, 10)) || new Date().toISOString().slice(0, 10);
                    const endAt = prompt("结束日期(YYYY-MM-DD)", startAt) || startAt;

                    for (const id of selectedIds) {
                      await fetch(`/api/admin/users/${id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ subscription: { planId, payCycle, startAt: new Date(startAt + "T00:00:00.000Z").toISOString(), endAt: new Date(endAt + "T00:00:00.000Z").toISOString() } }),
                      });
                    }
                    alert("批量更改订阅计划已提交（逐个更新）");
                    await refresh();
                  }}
                >
                  批量更改订阅计划
                </button>

                <button
                  className="w-full text-left px-2 py-2 hover:bg-gray-50 rounded disabled:opacity-50"
                  disabled={!selectedIds.length}
                  onClick={async () => {
                    setMoreOpen(false);
                    const addDaysStr = prompt("批量增加订阅时间：增加多少天？", "30");
                    if (!addDaysStr) return;
                    const addDays = Number(addDaysStr);
                    if (!Number.isFinite(addDays) || addDays <= 0) {
                      alert("天数不合法");
                      return;
                    }

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
                        body: JSON.stringify({ subscription: { planId: sub.planId, payCycle: sub.payCycle, startAt: sub.startAt, endAt: nextEnd.toISOString() } }),
                      });
                    }

                    alert("批量增加订阅时间已提交（逐个更新）");
                    await refresh();
                  }}
                >
                  批量增加订阅时间
                </button>

                <button
                  className="w-full text-left px-2 py-2 hover:bg-red-50 text-red-600 rounded disabled:opacity-50"
                  disabled={!selectedIds.length}
                  onClick={async () => {
                    setMoreOpen(false);
                    if (!confirm(`确定批量删除所选用户？\n将同步删除 Emby 服务器对应用户。\n数量：${selectedIds.length}`)) return;

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

      <div className="border rounded-lg overflow-auto">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="text-left text-gray-600 border-b">
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
              <th className="py-2 px-3">管理员(面板)</th>
              <th className="py-2 px-3">状态</th>
              <th className="py-2 px-3">余额</th>
              <th className="py-2 px-3">订阅状态</th>
              <th className="py-2 px-3">订阅计划</th>
              <th className="py-2 px-3">付费周期</th>
              <th className="py-2 px-3">所属服务器</th>
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
                <td className="py-2 px-3 font-mono">{r.username}</td>
                <td className="py-2 px-3">{dash(r.email)}</td>
                <td className="py-2 px-3">{r.role === "ADMIN" ? "是" : "否"}</td>
                <td className="py-2 px-3">{r.enabled ? "启用" : "禁用"}</td>
                <td className="py-2 px-3">{dash(r.balance)}</td>
                <td className="py-2 px-3">{dash(r.subscriptionStatus)}</td>
                <td className="py-2 px-3">{dash(r.planName)}</td>
                <td className="py-2 px-3">{dash(r.payCycle)}</td>
                <td className="py-2 px-3">{r.servers.length ? r.servers.join(",") : "-"}</td>
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
                        payCycle: "MONTHLY",
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
                          payCycle: (sub?.payCycle ?? "MONTHLY") as any,
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
                <td className="py-6 px-3 text-gray-500" colSpan={13}>
                  无数据
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {edit.open ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">编辑用户</div>
              <button className="text-sm underline" onClick={() => setEdit({ open: false })}>
                关闭
              </button>
            </div>

            {edit.loading ? <div className="mt-3 text-sm text-gray-500">加载中…</div> : null}
            {edit.error ? <pre className="mt-3 text-xs text-red-600 whitespace-pre-wrap">{edit.error}</pre> : null}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <label className="text-sm">付款周期</label>
                  <select
                    className="mt-1 w-full border rounded px-3 py-2"
                    value={edit.payCycle}
                    onChange={(e) => setEdit({ ...edit, payCycle: e.target.value as any })}
                  >
                    <option value="MONTHLY">月付</option>
                    <option value="QUARTERLY">季付</option>
                    <option value="HALF_YEARLY">半年付</option>
                    <option value="YEARLY">年付</option>
                    <option value="TWO_YEARLY">两年付</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm">订阅开始日期</label>
                  <input
                    className="mt-1 w-full border rounded px-3 py-2"
                    type="date"
                    value={edit.startAt}
                    onChange={(e) => setEdit({ ...edit, startAt: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm">订阅结束日期</label>
                  <input
                    className="mt-1 w-full border rounded px-3 py-2"
                    type="date"
                    value={edit.endAt}
                    onChange={(e) => setEdit({ ...edit, endAt: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
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

                  payload.subscription = {
                    planId: edit.planId || null,
                    payCycle: edit.payCycle,
                    startAt: new Date(edit.startAt + "T00:00:00.000Z").toISOString(),
                    endAt: new Date(edit.endAt + "T00:00:00.000Z").toISOString(),
                  };

                  const res = await fetch(`/api/admin/users/${edit.id}`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  if (!res.ok) {
                    const text = await res.text();
                    let msg = text;
                    try {
                      const j = JSON.parse(text);
                      if (j?.error === "cannot_demote_last_admin") {
                        msg = "面板至少需要保留一位管理员";
                      } else if (j?.error) {
                        msg = String(j.error);
                      }
                    } catch {}
                    alert(`保存失败: ${msg}`);
                    return;
                  }
                  setEdit({ open: false });
                  await refresh();
                }}
              >
                更新用户
              </button>
              <button className="border rounded px-3 py-2" onClick={() => setEdit({ open: false })}>
                取消
              </button>
              <button
                className={
                  "border rounded px-3 py-2 ml-auto " +
                  (edit.role === "ADMIN" ? "text-gray-400 border-gray-300 bg-gray-100 cursor-not-allowed" : "text-red-600")
                }
                disabled={edit.role === "ADMIN"}
                title={edit.role === "ADMIN" ? "面板管理员账户不可删除" : ""}
                onClick={async () => {
                  if (edit.role === "ADMIN") return;
                  if (!confirm(`确定删除用户：${edit.username} ?\n此操作会同步删除 Emby 服务器上的该用户。`)) return;
                  const res = await fetch(`/api/admin/users/${edit.id}/delete`, { method: "POST" });
                  const txt = await res.text();
                  if (!res.ok) {
                    alert(`删除失败: ${txt}`);
                    return;
                  }
                  setEdit({ open: false });
                  await refresh();
                }}
              >
                删除用户
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
                    if (!v) {
                      setImportPayCycle("");
                    }
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
                    <label className="text-sm">付款周期 *</label>
                    <select className="mt-1 w-full border rounded px-3 py-2" value={importPayCycle} onChange={(e) => setImportPayCycle(e.target.value as any)}>
                      <option value="">请选择付款周期</option>
                      <option value="MONTHLY">月付</option>
                      <option value="QUARTERLY">季付</option>
                      <option value="HALF_YEARLY">半年付</option>
                      <option value="YEARLY">年付</option>
                      <option value="TWO_YEARLY">两年付</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm">订阅开始日期 *</label>
                    <input className="mt-1 w-full border rounded px-3 py-2" type="date" value={importStartAt} onChange={(e) => setImportStartAt(e.target.value)} />
                  </div>

                  <div>
                    <label className="text-sm">订阅结束日期 *</label>
                    <input className="mt-1 w-full border rounded px-3 py-2" type="date" value={importEndAt} onChange={(e) => setImportEndAt(e.target.value)} />
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
                  <li>将导入 Emby 服务器上的所有非管理员用户（如选择特定用户，则只导入指定用户名）。</li>
                  <li>如果用户已存在于面板，将跳过创建；但会尝试补齐 EmbyUserLink。</li>
                  <li>不会重置 Emby 服务器中用户的密码；仅面板侧使用默认密码。</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button className="border rounded px-3 py-2" onClick={() => setImportOpen(false)}>
                取消
              </button>
              <button
                className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
                disabled={
                  !importServerId ||
                  importDefaultPassword.trim().length < 6 ||
                  importLoading ||
                  (importMode === "SELECTED" && importSelectedIds.length === 0 && importNamesText.trim().length === 0) ||
                  (importPlanId ? !importPayCycle || !importStartAt || !importEndAt || importStartAt >= importEndAt : false)
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
                        payCycle: importPlanId ? importPayCycle : null,
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

                    alert(`导入完成：imported=${json.imported}, skipped=${json.skipped}`);
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
                className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
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
              <button className="border rounded px-3 py-2" onClick={() => setCreateOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
