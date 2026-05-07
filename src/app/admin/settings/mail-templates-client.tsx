"use client";

import { useEffect, useState } from "react";
import { SettingsTabs } from "./tabs";

type Template = { label: string; subject: string; bodyHtml: string };

const ORDER = [
  "register_verify",
  "reset_password",
  "sub_expiring",
  "sub_expired",
  "order_confirm",
] as const;

const LABELS: Record<string, string> = {
  register_verify: "注册验证邮件",
  reset_password: "忘记密码邮件",
  sub_expiring: "订阅即将到期警告",
  sub_expired: "订阅已过期通知",
  order_confirm: "订单确认邮件",
};

const VARS = [
  "{{siteName}}",
  "{{siteUrl}}",
  "{{username}}",
  "{{email}}",
  "{{verificationCode}}",
  "{{resetUrl}}",
  "{{expireAt}}",
  "{{expiryDate}}",
  "{{expiredDate}}",
  "{{subscriptionName}}",
  "{{orderNo}}",
  "{{orderNumber}}",
  "{{orderDate}}",
  "{{amount}}",
  "{{renewUrl}}",
  "{{currentYear}}",
];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function MailTemplatesClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Record<string, Template>>({});
  const [activeKey, setActiveKey] = useState<string>("register_verify");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [noticeDays, setNoticeDays] = useState("3");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings/mail-templates", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      const t = (json?.data?.templates ?? {}) as Record<string, Template>;
      setTemplates(t);
      setNoticeDays(String(json?.data?.noticeDays ?? 3));
      const k = t[activeKey] ? activeKey : "register_verify";
      setActiveKey(k);
      setSubject(t[k]?.subject ?? "");
      setBodyHtml(t[k]?.bodyHtml ?? "");
    } catch (e: unknown) {
      setError(getErrorMessage(e, "load_failed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = templates[activeKey];
    if (!t) return;
    setSubject(t.subject);
    setBodyHtml(t.bodyHtml);
  }, [activeKey, templates]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">系统设置</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <SettingsTabs />

      <div className="border border-[#eaeaea] rounded-2xl bg-white p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">邮件模板管理</div>
        </div>

        <div className="flex gap-3 border-b overflow-auto whitespace-nowrap text-sm pb-1">
          {ORDER.map((k) => {
            const active = k === activeKey;
            return (
              <button
                key={k}
                className={
                  "px-3 py-2 border-b-2 rounded-t-lg transition-all " +
                  (active
                    ? "border-[#f3d4d8] bg-[#fff7f8] text-[#e3001b] font-bold shadow-[0_4px_12px_rgba(227,0,27,0.10)]"
                    : "border-transparent text-gray-700 hover:bg-[#fafafa] hover:text-[#222]")
                }
                onClick={() => setActiveKey(k)}
              >
                {LABELS[k]}
              </button>
            );
          })}
        </div>

        <div>
          <label className="text-sm"><span className="text-red-500 mr-1">*</span>邮件主题</label>
          <input className="mt-2 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div>
          <label className="text-sm"><span className="text-red-500 mr-1">*</span>邮件内容 (支持HTML)</label>
          <textarea className="mt-2 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none min-h-[280px] font-mono text-sm" value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} />
        </div>

        <div className="pt-3 border-t flex gap-2">
          <button
            className="bg-[#e3001b] text-white rounded px-4 py-2 disabled:opacity-60"
            disabled={saving || !subject.trim() || !bodyHtml.trim()}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const res = await fetch("/api/admin/settings/mail-templates", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ key: activeKey, subject, bodyHtml }),
                });
                const json = await res.json().catch(() => null);
                if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                alert(json?.defaultTemplate ? "已恢复为默认模板" : "保存模板成功");
                await refresh();
              } catch (e: unknown) {
                setError(getErrorMessage(e, "save_failed"));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "保存中…" : "保存修改"}
          </button>
          <button
            className="border border-[#eaeaea] bg-white rounded-lg px-4 py-2 hover:bg-[#f4f5f7]"
            onClick={() => {
              const html = bodyHtml
                .replaceAll("{{siteName}}", "BestEmby")
                .replaceAll("{{siteUrl}}", "https://example.com")
                .replaceAll("{{username}}", "test_user")
                .replaceAll("{{email}}", "test@example.com")
                .replaceAll("{{verificationCode}}", "123456")
                .replaceAll("{{resetUrl}}", "https://example.com/reset")
                .replaceAll("{{expireAt}}", "2026-12-31")
                .replaceAll("{{expiryDate}}", "2026-12-31")
                .replaceAll("{{expiredDate}}", "2026-12-31")
                .replaceAll("{{subscriptionName}}", "月付订阅")
                .replaceAll("{{orderNo}}", "NO20260001")
                .replaceAll("{{orderNumber}}", "NO20260001")
                .replaceAll("{{orderDate}}", "2026-05-05")
                .replaceAll("{{amount}}", "99")
                .replaceAll("{{renewUrl}}", "https://example.com")
                .replaceAll("{{currentYear}}", "2026");
              const w = window.open("", "_blank", "width=900,height=700");
              if (!w) return;
              w.document.write(html);
              w.document.close();
            }}
          >
            预览
          </button>
        </div>
        <div className="text-xs text-gray-500">默认邮件模板由代码内置，未修改时无需保存；只有编辑过主题或内容后才会保存为自定义模板。</div>

        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="font-medium mb-2">可用变量</div>
          <div className="text-sm text-gray-700 mb-2">在邮件主题和内容中可使用以下变量：</div>
          <div className="flex flex-wrap gap-2">
            {VARS.map((v) => (
              <span key={v} className="inline-flex px-2 py-1 rounded bg-white border text-xs font-mono">
                {v}
              </span>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-2">注意：变量将在发送邮件时自动替换为实际值</div>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <div className="font-medium">订阅通知设置</div>
          <div>
            <label className="text-sm">订阅到期提醒天数</label>
            <input
              className="mt-1 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none"
              value={noticeDays}
              onChange={(e) => setNoticeDays(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="例如 3"
            />
          </div>
          <div>
            <button
              className="bg-[#e3001b] text-white rounded px-4 py-2"
              onClick={async () => {
                const d = Number(noticeDays || "0");
                if (!Number.isFinite(d) || d < 1 || d > 30) {
                  alert("提醒天数需在 1~30 之间");
                  return;
                }
                const res = await fetch("/api/admin/settings/mail-templates", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ noticeDays: d }),
                });
                const json = await res.json().catch(() => null);
                if (!res.ok) {
                  alert(json?.error || `HTTP ${res.status}`);
                  return;
                }
                alert("保存设置成功");
                await refresh();
              }}
            >
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
