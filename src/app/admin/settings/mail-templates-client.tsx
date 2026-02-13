"use client";

import { useEffect, useMemo, useState } from "react";
import { SettingsTabs } from "./tabs";

type Template = { label: string; subject: string; bodyHtml: string };

const ORDER = [
  "register_verify",
  "reset_password",
  "change_email",
  "sub_expiring",
  "sub_expired",
  "order_confirm",
  "worker_reply",
  "invite_user",
] as const;

const LABELS: Record<string, string> = {
  register_verify: "注册验证邮件",
  reset_password: "忘记密码邮件",
  change_email: "邮箱变更验证邮件",
  sub_expiring: "订阅即将到期警告",
  sub_expired: "订阅已过期通知",
  order_confirm: "订单确认邮件",
  worker_reply: "工单回复通知",
  invite_user: "用户邀请邮件",
};

const VARS = ["{{siteName}}", "{{siteUrl}}", "{{username}}", "{{email}}", "{{verificationCode}}", "{{resetUrl}}", "{{expireAt}}", "{{orderNo}}", "{{amount}}", "{{ticketNo}}", "{{inviterName}}", "{{inviteUrl}}"];

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
    } catch (e: any) {
      setError(e?.message || "load_failed");
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

  const dirty = useMemo(() => {
    const t = templates[activeKey];
    if (!t) return false;
    return t.subject !== subject || t.bodyHtml !== bodyHtml;
  }, [activeKey, templates, subject, bodyHtml]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">系统设置</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <SettingsTabs />

      <div className="border rounded-lg bg-white p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">邮件模板管理</div>
          <div className="flex gap-2">
            <select className="border rounded px-3 py-2 text-sm" value={activeKey} onChange={(e) => setActiveKey(e.target.value)}>
              {ORDER.map((k) => (
                <option key={k} value={k}>
                  {LABELS[k]}
                </option>
              ))}
            </select>
            <button className="border rounded px-3 py-2 text-sm" onClick={refresh}>
              刷新
            </button>
          </div>
        </div>

        <div className="flex gap-5 border-b overflow-auto whitespace-nowrap text-sm">
          {ORDER.map((k) => {
            const active = k === activeKey;
            return (
              <button
                key={k}
                className={"pb-2 border-b-2 " + (active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-700")}
                onClick={() => setActiveKey(k)}
              >
                {LABELS[k]}
              </button>
            );
          })}
        </div>

        <div>
          <label className="text-sm"><span className="text-red-500 mr-1">*</span>邮件主题</label>
          <input className="mt-2 w-full border rounded px-3 py-2" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div>
          <label className="text-sm"><span className="text-red-500 mr-1">*</span>邮件内容 (支持HTML)</label>
          <textarea className="mt-2 w-full border rounded px-3 py-2 min-h-[280px] font-mono text-sm" value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} />
        </div>

        <div className="pt-3 border-t flex gap-2">
          <button
            className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-60"
            disabled={saving || !subject.trim() || !bodyHtml.trim() || !dirty}
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
                alert("保存模板成功");
                await refresh();
              } catch (e: any) {
                setError(e?.message || "save_failed");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "保存中…" : "保存模板"}
          </button>
          <button
            className="border rounded px-4 py-2"
            onClick={() => {
              const html = bodyHtml
                .replaceAll("{{siteName}}", "BestEmby")
                .replaceAll("{{siteUrl}}", "https://example.com")
                .replaceAll("{{username}}", "test_user")
                .replaceAll("{{email}}", "test@example.com")
                .replaceAll("{{verificationCode}}", "123456")
                .replaceAll("{{resetUrl}}", "https://example.com/reset")
                .replaceAll("{{expireAt}}", "2026-12-31")
                .replaceAll("{{orderNo}}", "NO20260001")
                .replaceAll("{{amount}}", "99")
                .replaceAll("{{ticketNo}}", "TK10086")
                .replaceAll("{{inviterName}}", "admin")
                .replaceAll("{{inviteUrl}}", "https://example.com/invite");
              const w = window.open("", "_blank", "width=900,height=700");
              if (!w) return;
              w.document.write(html);
              w.document.close();
            }}
          >
            预览
          </button>
        </div>

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
              className="mt-1 w-full border rounded px-3 py-2"
              value={noticeDays}
              onChange={(e) => setNoticeDays(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="例如 3"
            />
          </div>
          <div>
            <button
              className="bg-blue-600 text-white rounded px-4 py-2"
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
