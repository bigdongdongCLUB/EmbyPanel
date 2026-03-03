"use client";

import { useEffect, useState } from "react";

export function PortalProfileModalClient() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [expiryReminderEnabled, setExpiryReminderEnabled] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/profile", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setEmail(json?.profile?.email || "");
      setExpiryReminderEnabled(!!json?.profile?.expiryReminderEnabled);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      alert(`加载个人资料失败: ${e?.message || "unknown"}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      loadProfile();
    };
    window.addEventListener("portal:open-profile", onOpen);
    return () => window.removeEventListener("portal:open-profile", onOpen);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-[#eaeaea] rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto p-5 space-y-2 text-[14px]">
        <div className="flex items-center justify-between">
          <div className="text-xl font-semibold">账户设置</div>
          <button className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-[#f2d4d9] bg-[#fff7f8] hover:border-[#e3001b] hover:bg-[#fff0f1]" onClick={() => setOpen(false)} aria-label="关闭">
            <img src="/icons/delete.svg" alt="关闭" className="h-3.5 w-3.5" />
          </button>
        </div>

        {loading ? <div className="text-xs text-gray-500">加载中…</div> : null}

        <div className="space-y-2">
          <div className="font-semibold">账户信息</div>
          <div>
            <label className="text-xs">电子邮箱</label>
            <input className="mt-1 w-full border border-[#eaeaea] rounded-lg px-2.5 py-1.5 bg-[#f4f5f7] text-gray-800 focus:outline-none focus:border-[#e3001b]" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="请输入邮箱" />
          </div>
          <div>
            <div className="text-xs font-medium flex items-center gap-2">
              订阅到期提醒
              <span className="relative inline-flex items-center group cursor-help">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-xs text-gray-500">?</span>
                <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-11 whitespace-nowrap rounded bg-black text-white text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  开启后，将在订阅即将到期时收到提醒通知
                </span>
              </span>
            </div>
            <div className="mt-2">
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={expiryReminderEnabled}
                  onChange={(e) => setExpiryReminderEnabled(e.target.checked)}
                />
                {expiryReminderEnabled ? "开启" : "关闭"}
              </label>
            </div>
          </div>
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="font-semibold">密码设置</div>
          <div>
            <label className="text-xs">当前密码</label>
            <input type="password" className="mt-1 w-full border border-[#eaeaea] rounded-lg px-2.5 py-1.5 bg-[#f4f5f7] text-gray-800 focus:outline-none focus:border-[#e3001b]" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="请输入当前密码" />
          </div>
          <div>
            <label className="text-xs">新密码</label>
            <input type="password" className="mt-1 w-full border border-[#eaeaea] rounded-lg px-2.5 py-1.5 bg-[#f4f5f7] text-gray-800 focus:outline-none focus:border-[#e3001b]" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="请输入新密码（至少6位）" />
          </div>
          <div>
            <label className="text-xs">确认新密码</label>
            <input type="password" className="mt-1 w-full border border-[#eaeaea] rounded-lg px-2.5 py-1.5 bg-[#f4f5f7] text-gray-800 focus:outline-none focus:border-[#e3001b]" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="请再次输入新密码" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="border border-[#eaeaea] bg-white rounded-lg px-3 py-1.5 text-[#666]" onClick={() => setOpen(false)}>取消</button>
          <button
            className="bg-[#e3001b] hover:bg-[#c20017] text-white rounded-lg px-3 py-1.5"
            onClick={async () => {
              const payload: any = {
                email: email.trim() || null,
                expiryReminderEnabled,
              };
              if (currentPassword || newPassword || confirmPassword) {
                payload.currentPassword = currentPassword;
                payload.newPassword = newPassword;
                payload.confirmPassword = confirmPassword;
              }

              const res = await fetch("/api/portal/profile", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
              });
              const json = await res.json().catch(() => null);
              if (!res.ok) {
                alert(`保存失败: ${json?.error || `HTTP ${res.status}`}`);
                return;
              }
              setOpen(false);
              alert("设置已保存");
            }}
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
