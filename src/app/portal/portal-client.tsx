"use client";

import { useEffect, useState } from "react";

type Data = {
  dashboard: {
    balanceYuan: number;
    subscriptionEndAt: string | null;
    subscriptionPlan: string;
    remainingDays: number;
  };
  announcement: { title: string; content: string };
};

function fmtDateYmd(v?: string | null) {
  if (!v) return "--";
  return new Date(v).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export function PortalClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [expiryReminderEnabled, setExpiryReminderEnabled] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/dashboard", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e: any) {
      setError(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadProfile() {
    setProfileLoading(true);
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
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setProfileOpen(true);
      loadProfile();
    };
    window.addEventListener("portal:open-profile", onOpen);
    return () => window.removeEventListener("portal:open-profile", onOpen);
  }, []);

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="border rounded-lg p-4"><div className="text-sm text-gray-500">账户余额</div><div className="text-3xl font-semibold mt-2">{(data?.dashboard.balanceYuan ?? 0).toFixed(2)} <span className="text-base font-normal">元</span></div></div>
        <div className="border rounded-lg p-4"><div className="text-sm text-gray-500">订阅到期日</div><div className="text-3xl font-semibold mt-2">{fmtDateYmd(data?.dashboard.subscriptionEndAt)}</div></div>
        <div className="border rounded-lg p-4"><div className="text-sm text-gray-500">订阅计划</div><div className="text-3xl font-semibold mt-2">{data?.dashboard.subscriptionPlan ?? "无订阅"}</div></div>
        <div className="border rounded-lg p-4"><div className="text-sm text-gray-500">剩余时间</div><div className="text-3xl font-semibold mt-2">{data?.dashboard.remainingDays ?? 0} <span className="text-base font-normal">天</span></div></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="border rounded-lg">
          <div className="px-4 py-3 border-b font-medium">系统公告</div>
          <div className="p-4">
            <div className="font-semibold">{data?.announcement.title ?? "系统公告"}</div>
            <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{data?.announcement.content ?? "暂无公告"}</div>
          </div>
        </div>

        <div className="border rounded-lg">
          <div className="px-4 py-3 border-b font-medium">卡密兑换</div>
          <div className="p-4 space-y-3">
            <div className="text-sm text-gray-600">输入卡密可快速充值余额或激活订阅。</div>
            <input
              className="w-full border rounded px-3 py-2 font-mono"
              placeholder="请输入卡密"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            />
            <button
              className="w-full bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50"
              disabled={!redeemCode.trim() || redeeming}
              onClick={async () => {
                setRedeeming(true);
                try {
                  const res = await fetch("/api/portal/redeem", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ code: redeemCode.trim() }),
                  });
                  const json = await res.json().catch(() => null);
                  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                  alert("兑换成功");
                  setRedeemCode("");
                  await refresh();
                } catch (e: any) {
                  alert(`兑换失败: ${e?.message || "unknown"}`);
                } finally {
                  setRedeeming(false);
                }
              }}
            >
              兑换并使用
            </button>
          </div>
        </div>
      </div>

      {profileOpen ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-semibold">账户设置</div>
              <button className="text-gray-500 hover:text-gray-700 text-2xl leading-none" onClick={() => setProfileOpen(false)}>×</button>
            </div>

            {profileLoading ? <div className="text-sm text-gray-500">加载中…</div> : null}

            <div className="space-y-3">
              <div className="font-semibold">账户信息</div>
              <div>
                <label className="text-sm">电子邮箱</label>
                <input className="mt-1 w-full border rounded px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="请输入邮箱" />
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
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="font-semibold">密码设置</div>
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
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="border rounded px-4 py-2" onClick={() => setProfileOpen(false)}>取消</button>
              <button
                className="bg-blue-600 text-white rounded px-4 py-2"
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
                  setProfileOpen(false);
                  alert("设置已保存");
                }}
              >
                保存设置
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
