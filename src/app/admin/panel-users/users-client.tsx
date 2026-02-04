"use client";

import { useEffect, useMemo, useState } from "react";

type PanelUser = {
  id: string;
  username: string;
  email: string | null;
  role: "USER" | "ADMIN";
  enabled: boolean;
  createdAt: string;
};

function dash(v: any) {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

export function PanelUsersClient() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PanelUser[]>([]);

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
      const url = new URL(window.location.origin + "/api/admin/panel-users");
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
            + 创建账号
          </button>
        </div>
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="border rounded-lg overflow-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="text-left text-gray-600 border-b">
            <tr>
              <th className="py-2 px-3">用户名</th>
              <th className="py-2 px-3">邮箱</th>
              <th className="py-2 px-3">角色</th>
              <th className="py-2 px-3">状态</th>
              <th className="py-2 px-3">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="py-2 px-3 font-mono">{r.username}</td>
                <td className="py-2 px-3">{dash(r.email)}</td>
                <td className="py-2 px-3">{r.role === "ADMIN" ? "管理员" : "用户"}</td>
                <td className="py-2 px-3">{r.enabled ? "启用" : "禁用"}</td>
                <td className="py-2 px-3 font-mono text-xs">{dash(r.createdAt)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td className="py-6 px-3 text-gray-500" colSpan={5}>
                  无数据
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-lg p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">创建面板账号</div>
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
                <label className="text-sm">角色</label>
                <select className="mt-1 w-full border rounded px-3 py-2" value={newRole} onChange={(e) => setNewRole(e.target.value as any)}>
                  <option value="USER">用户</option>
                  <option value="ADMIN">管理员</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
                disabled={!canCreate}
                onClick={async () => {
                  const res = await fetch("/api/admin/panel-users", {
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
