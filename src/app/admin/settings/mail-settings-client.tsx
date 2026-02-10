"use client";

import { useEffect, useState } from "react";
import { SettingsTabs } from "./tabs";

type FormState = {
  enabled: boolean;
  smtpHost: string;
  secureMode: "ssl" | "starttls" | "none";
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
};

export function MailSettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    enabled: false,
    smtpHost: "",
    secureMode: "ssl",
    smtpPort: "465",
    smtpUser: "",
    smtpPassword: "",
    fromEmail: "",
    fromName: "",
  });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings/mail", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setForm({
        enabled: !!json?.data?.enabled,
        smtpHost: String(json?.data?.smtpHost ?? ""),
        secureMode: (json?.data?.secureMode as any) || "ssl",
        smtpPort: String(json?.data?.smtpPort ?? "465"),
        smtpUser: String(json?.data?.smtpUser ?? ""),
        smtpPassword: "",
        fromEmail: String(json?.data?.fromEmail ?? ""),
        fromName: String(json?.data?.fromName ?? ""),
      });
    } catch (e: any) {
      setError(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const canSave = form.smtpHost.trim() && form.smtpPort.trim() && form.fromEmail.trim();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">系统设置</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <SettingsTabs />

      <div className="border rounded-lg bg-white p-6 space-y-5">
        <div className="text-lg font-semibold">邮件设置</div>

        <div className="flex items-center gap-3">
          <span className="text-sm">启用邮件通知</span>
          <button
            className={
              "px-3 py-1 rounded-full text-xs " + (form.enabled ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700")
            }
            onClick={() => setForm((s) => ({ ...s, enabled: !s.enabled }))}
          >
            {form.enabled ? "已启用" : "已禁用"}
          </button>
        </div>

        <div>
          <label className="text-sm">SMTP服务器</label>
          <input className="mt-2 w-full border rounded px-3 py-2" value={form.smtpHost} onChange={(e) => setForm((s) => ({ ...s, smtpHost: e.target.value }))} />
        </div>

        <div>
          <label className="text-sm">加密方式</label>
          <select className="mt-2 w-full border rounded px-3 py-2" value={form.secureMode} onChange={(e) => setForm((s) => ({ ...s, secureMode: e.target.value as any }))}>
            <option value="ssl">TLS/SSL</option>
            <option value="starttls">STARTTLS</option>
            <option value="none">无加密</option>
          </select>
        </div>

        <div>
          <label className="text-sm">SMTP端口</label>
          <input className="mt-2 w-full border rounded px-3 py-2" value={form.smtpPort} onChange={(e) => setForm((s) => ({ ...s, smtpPort: e.target.value }))} />
        </div>

        <div>
          <label className="text-sm">SMTP用户名</label>
          <input className="mt-2 w-full border rounded px-3 py-2" value={form.smtpUser} onChange={(e) => setForm((s) => ({ ...s, smtpUser: e.target.value }))} />
        </div>

        <div>
          <label className="text-sm">SMTP密码</label>
          <input
            className="mt-2 w-full border rounded px-3 py-2"
            type="password"
            placeholder="留空表示不修改"
            value={form.smtpPassword}
            onChange={(e) => setForm((s) => ({ ...s, smtpPassword: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-sm">发件人地址</label>
          <input className="mt-2 w-full border rounded px-3 py-2" value={form.fromEmail} onChange={(e) => setForm((s) => ({ ...s, fromEmail: e.target.value }))} />
        </div>

        <div>
          <label className="text-sm">发件人名称</label>
          <input className="mt-2 w-full border rounded px-3 py-2" value={form.fromName} onChange={(e) => setForm((s) => ({ ...s, fromName: e.target.value }))} />
        </div>

        <div className="pt-3 border-t flex gap-2 items-center flex-wrap">
          <button
            className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-60"
            disabled={saving || !canSave}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const res = await fetch("/api/admin/settings/mail", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(form),
                });
                const json = await res.json().catch(() => null);
                if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                alert("保存设置成功");
                setForm((s) => ({ ...s, smtpPassword: "" }));
              } catch (e: any) {
                setError(e?.message || "save_failed");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "保存中…" : "保存设置"}
          </button>

          <button
            className="border rounded px-4 py-2 disabled:opacity-60"
            disabled={testing || !form.fromEmail.trim()}
            onClick={async () => {
              setTesting(true);
              setError(null);
              try {
                const res = await fetch("/api/admin/settings/mail/test", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ ...form }),
                });
                const json = await res.json().catch(() => null);
                if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                alert("测试邮件发送成功");
              } catch (e: any) {
                setError(e?.message || "test_failed");
              } finally {
                setTesting(false);
              }
            }}
          >
            {testing ? "发送中…" : "发送测试邮件（发给自己）"}
          </button>
        </div>
      </div>
    </div>
  );
}
