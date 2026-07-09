"use client";

import { useEffect, useState } from "react";
import { SettingsTabs } from "./tabs";
import { ToggleSwitch } from "./toggle-switch";

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

      <div className="border border-[#eaeaea] rounded-2xl bg-white p-6 space-y-5">
        <div className="text-lg font-semibold">安全设置</div>

        <div className="space-y-1.5">
          <div className="text-sm">开放注册</div>
          <ToggleSwitch checked={form.openRegistration} onChange={(next) => setForm((s) => ({ ...s, openRegistration: next }))} />
        </div>

        <div className="space-y-1.5">
          <div className="text-sm">邮箱验证（注册需输入邮箱验证码）</div>
          <ToggleSwitch checked={form.requireEmailVerification} onChange={(next) => setForm((s) => ({ ...s, requireEmailVerification: next }))} />
        </div>

        <div className="space-y-1.5">
          <div className="text-sm">仅限邀请注册</div>
          <ToggleSwitch checked={form.inviteOnly} onChange={(next) => setForm((s) => ({ ...s, inviteOnly: next }))} />
        </div>

        <div>
          <label className="text-sm">系统保留用户名（逗号分隔）</label>
          <textarea
            className="mt-1 w-full min-h-[90px] border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none"
            value={form.reservedUsernames}
            onChange={(e) => setForm((s) => ({ ...s, reservedUsernames: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <div className="text-sm">启用复杂密码（8-20位，含小写字母、大写字母、数字）</div>
          <ToggleSwitch checked={form.strongPassword} onChange={(next) => setForm((s) => ({ ...s, strongPassword: next }))} />
        </div>

        <div className="pt-2">
          <button
            className="bg-[#e3001b] text-white rounded px-4 py-2 disabled:opacity-60"
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
