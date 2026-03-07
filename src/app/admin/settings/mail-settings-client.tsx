"use client";

import { useEffect, useState } from "react";
import { SettingsTabs } from "./tabs";
import { ToggleSwitch } from "./toggle-switch";

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
  const [smtpTestedOk, setSmtpTestedOk] = useState(false);
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
      const data = json?.data ?? {};
      const smtpConfigured = !!(data.smtpHost && data.smtpPort && data.fromEmail);
      setForm({
        enabled: !!data.enabled,
        smtpHost: String(data.smtpHost ?? ""),
        secureMode: (data.secureMode as any) || "ssl",
        smtpPort: String(data.smtpPort ?? "465"),
        smtpUser: String(data.smtpUser ?? ""),
        smtpPassword: "",
        fromEmail: String(data.fromEmail ?? ""),
        fromName: String(data.fromName ?? ""),
      });
      // 如果 SMTP 配置已保存且启用，认为已测试通过（宽松模式）
      setSmtpTestedOk(smtpConfigured && !!data.enabled);
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

      <div className="border border-[#eaeaea] rounded-2xl bg-white p-6 space-y-5">
        <div className="text-lg font-semibold">邮件设置</div>

        <div className="space-y-1.5">
          <div className="text-sm">启用邮件通知</div>
          <ToggleSwitch
            checked={form.enabled}
            onChange={(next) => {
              if (next && !smtpTestedOk) {
                alert("需要先设置 SMTP 服务器且测试成功后才可以启用邮件通知");
                return;
              }
              setForm((s) => ({ ...s, enabled: next }));
            }}
            textOn="已启用"
            textOff="已禁用"
          />
          {!smtpTestedOk && form.enabled ? (
            <p className="text-xs text-orange-600">⚠️ SMTP 未测试或测试失败，邮件通知可能无法正常工作</p>
          ) : null}
        </div>

        <div>
          <label className="text-sm">SMTP服务器</label>
          <input className="mt-2 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={form.smtpHost} onChange={(e) => setForm((s) => ({ ...s, smtpHost: e.target.value }))} />
        </div>

        <div>
          <label className="text-sm">加密方式</label>
          <select className="mt-2 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={form.secureMode} onChange={(e) => setForm((s) => ({ ...s, secureMode: e.target.value as any }))}>
            <option value="ssl">TLS/SSL</option>
            <option value="starttls">STARTTLS</option>
            <option value="none">无加密</option>
          </select>
        </div>

        <div>
          <label className="text-sm">SMTP端口</label>
          <input className="mt-2 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={form.smtpPort} onChange={(e) => setForm((s) => ({ ...s, smtpPort: e.target.value }))} />
        </div>

        <div>
          <label className="text-sm">SMTP用户名</label>
          <input className="mt-2 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={form.smtpUser} onChange={(e) => setForm((s) => ({ ...s, smtpUser: e.target.value }))} />
        </div>

        <div>
          <label className="text-sm">SMTP密码</label>
          <input
            className="mt-2 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none"
            type="password"
            placeholder="留空表示不修改"
            value={form.smtpPassword}
            onChange={(e) => setForm((s) => ({ ...s, smtpPassword: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-sm">发件人地址</label>
          <input className="mt-2 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={form.fromEmail} onChange={(e) => setForm((s) => ({ ...s, fromEmail: e.target.value }))} />
        </div>

        <div>
          <label className="text-sm">发件人名称</label>
          <input className="mt-2 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={form.fromName} onChange={(e) => setForm((s) => ({ ...s, fromName: e.target.value }))} />
        </div>

        <div className="pt-3 flex gap-2 items-center flex-wrap">
          <button
            className="bg-[#e3001b] text-white rounded px-4 py-2 disabled:opacity-60"
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
                // 保存成功后如果 SMTP 配置完整，标记为已测试（宽松模式，允许先保存再测试）
                if (form.smtpHost && form.smtpPort && form.fromEmail) {
                  setSmtpTestedOk(true);
                }
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
            className="border border-[#eaeaea] bg-white rounded-lg px-4 py-2 hover:bg-[#f4f5f7] disabled:opacity-60"
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
                setSmtpTestedOk(true);
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
