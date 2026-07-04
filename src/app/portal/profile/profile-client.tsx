"use client";

import { useEffect, useState } from "react";

function mapProfileErrorMessage(code?: string, fallback?: string) {
  switch (String(code || "")) {
    case "unauthorized":
      return "登录已失效，请重新登录";
    case "not_found":
      return "未找到当前用户";
    case "invalid_payload":
      return "提交参数有误，请检查后重试";
    case "password_fields_required":
      return "请完整填写当前密码、新密码和确认密码";
    case "password_too_short":
      return "新密码长度至少 6 位";
    case "password_confirm_mismatch":
      return "两次输入的新密码不一致";
    case "current_password_invalid":
      return "当前密码不正确";
    case "email_taken":
      return "该邮箱已被使用";
    default:
      return fallback || code || "操作失败";
  }
}

export function PortalProfileClient() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [expiryReminderEnabled, setExpiryReminderEnabled] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/portal/profile", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      alert(mapProfileErrorMessage(json?.error, `HTTP ${res.status}`));
      setLoading(false);
      return;
    }
    setEmail(json?.profile?.email || "");
    setExpiryReminderEnabled(!!json?.profile?.expiryReminderEnabled);
    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, []);

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-semibold">个人资料</h1>

      <div className="border rounded-lg">
        <div className="px-4 py-3 border-b font-semibold">账户信息</div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm">电子邮箱</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="请输入邮箱" />
            <div className="text-xs text-gray-500 mt-2">修改邮箱后将立即生效。</div>
          </div>

          <div>
            <label className="text-sm">订阅到期提醒</label>
            <div className="mt-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={expiryReminderEnabled} onChange={(e) => setExpiryReminderEnabled(e.target.checked)} />
                {expiryReminderEnabled ? "开启" : "关闭"}
              </label>
            </div>
          </div>

          <div>
            <button
              className="bg-[#e3001b] hover:bg-[#c20017] text-white rounded-lg px-4 py-2 disabled:opacity-50"
              disabled={loading}
              onClick={async () => {
                const res = await fetch("/api/portal/profile", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ email: email.trim() || null, expiryReminderEnabled }),
                });
                const json = await res.json().catch(() => null);
                if (!res.ok) {
                  alert(`保存失败 ${mapProfileErrorMessage(json?.error, `HTTP ${res.status}`)}`);
                  return;
                }
                alert("资料已更新");
              }}
            >
              保存账户信息
            </button>
          </div>
        </div>
      </div>

      <div className="border rounded-lg">
        <div className="px-4 py-3 border-b font-semibold">密码设置</div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-sm">当前密码</label>
            <input type="password" className="mt-1 w-full border rounded px-3 py-2" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="请输入当前密码" />
          </div>

          <div>
            <label className="text-sm">新密码</label>
            <input type="password" className="mt-1 w-full border rounded px-3 py-2" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="请输入新密码（至少6位）" />
          </div>

          <div>
            <label className="text-sm">确认新密码</label>
            <input type="password" className="mt-1 w-full border rounded px-3 py-2" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="请再次输入新密码" />
          </div>

          <div>
            <button
              className="bg-[#e3001b] hover:bg-[#c20017] text-white rounded-lg px-4 py-2"
              onClick={async () => {
                const res = await fetch("/api/portal/profile", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
                });
                const json = await res.json().catch(() => null);
                if (!res.ok) {
                  alert(`修改失败: ${mapProfileErrorMessage(json?.error, `HTTP ${res.status}`)}`);
                  return;
                }
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                alert("密码修改成功");
              }}
            >
              保存新密码
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
