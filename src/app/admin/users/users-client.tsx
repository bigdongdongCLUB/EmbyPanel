"use client";

import { useEffect, useMemo, useState } from "react";

type UserRow = {
  id: string;
  username: string;
  email: string | null;
  role: "USER" | "ADMIN";
  enabled: boolean;
  expiryReminderEnabled?: boolean;
  balance: number | null;
  subscriptionStatus: string | null;
  planName: string | null;
  payCycle: string | null;
  remark: string | null;
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
      embyServerId: string;
      payCycle: "MONTHLY" | "QUARTERLY" | "YEARLY";
      startAt: string;
      endAt: string;
      servers: Array<{ id: string; name: string }>;
    };

function dash(v: any) {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

export function UsersClient() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<UserRow[]>([]);

  const [edit, setEdit] = useState<EditState>({ open: false });

  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"USER" | "ADMIN">("USER");

  const canCreate = useMemo(() => newUsername.trim() && newPassword.length >= 6, [newUsername, newPassword]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(window.location.origin + "/api/admin/users");
      if (q.trim()) url.searchParams.set("q", q.trim());
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
      setRows(json.users ?? []);
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
            placeholder="搜索用户/邮箱"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="border rounded px-3 py-2" onClick={refresh}>
            查询
          </button>
        </div>
        <div className="flex gap-2">
          <button className="bg-black text-white rounded px-3 py-2" onClick={() => setCreateOpen(true)}>
            + 创建用户
          </button>
          <button className="border rounded px-3 py-2" disabled title="后期做导入 Emby 用户">
            导入用户
          </button>
        </div>
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="border rounded-lg overflow-auto">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="text-left text-gray-600 border-b">
            <tr>
              <th className="py-2 px-3">用户</th>
              <th className="py-2 px-3">邮箱</th>
              <th className="py-2 px-3">管理员(面板)</th>
              <th className="py-2 px-3">状态</th>
              <th className="py-2 px-3">余额</th>
              <th className="py-2 px-3">订阅状态</th>
              <th className="py-2 px-3">订阅计划</th>
              <th className="py-2 px-3">付费周期</th>
              <th className="py-2 px-3">备注</th>
              <th className="py-2 px-3">所属服务器</th>
              <th className="py-2 px-3">到期时间</th>
              <th className="py-2 px-3">创建时间</th>
              <th className="py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="py-2 px-3 font-mono">{r.username}</td>
                <td className="py-2 px-3">{dash(r.email)}</td>
                <td className="py-2 px-3">{r.role === "ADMIN" ? "是" : "否"}</td>
                <td className="py-2 px-3">{r.enabled ? "启用" : "禁用"}</td>
                <td className="py-2 px-3">{dash(r.balance)}</td>
                <td className="py-2 px-3">{dash(r.subscriptionStatus)}</td>
                <td className="py-2 px-3">{dash(r.planName)}</td>
                <td className="py-2 px-3">{dash(r.payCycle)}</td>
                <td className="py-2 px-3">{dash(r.remark)}</td>
                <td className="py-2 px-3">{r.servers.length ? r.servers.join(",") : "-"}</td>
                <td className="py-2 px-3 font-mono text-xs">{dash(r.endAt)}</td>
                <td className="py-2 px-3 font-mono text-xs">{dash(r.createdAt)}</td>
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
                        embyServerId: "",
                        payCycle: "MONTHLY",
                        startAt: new Date().toISOString().slice(0, 10),
                        endAt: new Date().toISOString().slice(0, 10),
                        servers: [],
                      });
                      try {
                        const res = await fetch(`/api/admin/users/${r.id}`, { cache: "no-store" });
                        const json = await res.json().catch(() => null);
                        if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);

                        const u = json.user;
                        const sub = u.subscriptions?.[0] ?? null;
                        const serverId = (sub?.servers ?? [])[0]?.embyServerId ?? "";

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
                          embyServerId: serverId,
                          payCycle: (sub?.payCycle ?? "MONTHLY") as any,
                          startAt: sub?.startAt ? String(sub.startAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
                          endAt: sub?.endAt ? String(sub.endAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
                          servers: json.servers ?? [],
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
                  <label className="text-sm">订阅计划（选择 Emby 服务器）</label>
                  <select
                    className="mt-1 w-full border rounded px-3 py-2"
                    value={edit.embyServerId}
                    onChange={(e) => setEdit({ ...edit, embyServerId: e.target.value })}
                  >
                    <option value="">-</option>
                    {edit.servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-gray-500 mt-1">不选择则表示无订阅（仅存在面板）。</div>
                </div>

                <div>
                  <label className="text-sm">付款周期</label>
                  <select
                    className="mt-1 w-full border rounded px-3 py-2"
                    value={edit.payCycle}
                    disabled={!edit.embyServerId}
                    onChange={(e) => setEdit({ ...edit, payCycle: e.target.value as any })}
                  >
                    <option value="MONTHLY">月付</option>
                    <option value="QUARTERLY">季付</option>
                    <option value="YEARLY">年付</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm">订阅开始日期</label>
                  <input
                    className="mt-1 w-full border rounded px-3 py-2"
                    type="date"
                    value={edit.startAt}
                    disabled={!edit.embyServerId}
                    onChange={(e) => setEdit({ ...edit, startAt: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm">订阅结束日期</label>
                  <input
                    className="mt-1 w-full border rounded px-3 py-2"
                    type="date"
                    value={edit.endAt}
                    disabled={!edit.embyServerId}
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
                    newPassword: edit.newPassword,
                  };

                  if (edit.embyServerId) {
                    payload.subscription = {
                      embyServerId: edit.embyServerId,
                      payCycle: edit.payCycle,
                      startAt: new Date(edit.startAt + "T00:00:00.000Z").toISOString(),
                      endAt: new Date(edit.endAt + "T00:00:00.000Z").toISOString(),
                    };
                  } else {
                    payload.subscription = null;
                  }

                  const res = await fetch(`/api/admin/users/${edit.id}`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  if (!res.ok) {
                    alert(`保存失败: ${await res.text()}`);
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
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-lg p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">创建用户（面板用户）</div>
              <button className="text-sm underline" onClick={() => setCreateOpen(false)}>
                关闭
              </button>
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
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
                disabled={!canCreate}
                onClick={async () => {
                  const res = await fetch("/api/admin/users", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ username: newUsername.trim(), email: newEmail.trim(), password: newPassword, role: newRole }),
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
