"use client";

import { useEffect, useState } from "react";
import { SettingsTabs } from "./tabs";

type Form = {
  openRegistration: boolean;
  requireEmailVerification: boolean;
  inviteOnly: boolean;
  reservedUsernames: string;
  strongPassword: boolean;
};

export function SecuritySettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({
    openRegistration: true,
    requireEmailVerification: false,
    inviteOnly: false,
    reservedUsernames: "",
    strongPassword: false,
  });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings/security", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setForm(json.data);
    } catch (e: any) {
      setError(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">系统设置</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <SettingsTabs />

      <div className="border rounded-lg bg-white p-6 space-y-5">
        <div className="text-lg font-semibold">安全设置</div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.openRegistration} onChange={(e) => setForm((s) => ({ ...s, openRegistration: e.target.checked }))} />
          开放注册
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.requireEmailVerification}
            onChange={(e) => setForm((s) => ({ ...s, requireEmailVerification: e.target.checked }))}
          />
          邮箱验证（注册需输入邮箱验证码）
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.inviteOnly} onChange={(e) => setForm((s) => ({ ...s, inviteOnly: e.target.checked }))} />
          仅限邀请注册
        </label>

        <div>
          <label className="text-sm">系统保留用户名（逗号分隔）</label>
          <textarea
            className="mt-1 w-full min-h-[90px] border rounded px-3 py-2"
            value={form.reservedUsernames}
            onChange={(e) => setForm((s) => ({ ...s, reservedUsernames: e.target.value }))}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.strongPassword} onChange={(e) => setForm((s) => ({ ...s, strongPassword: e.target.checked }))} />
          启用复杂密码（10-32位，含大小写、数字、特殊字符）
        </label>

        <div className="pt-2">
          <button
            className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-60"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const res = await fetch("/api/admin/settings/security", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(form),
                });
                const json = await res.json().catch(() => null);
                if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                alert("保存设置成功");
              } catch (e: any) {
                setError(e?.message || "save_failed");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "保存中…" : "保存设置"}
          </button>
        </div>
      </div>
    </div>
  );
}
