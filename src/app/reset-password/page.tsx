"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function EyeIcon({ off }: { off?: boolean }) {
  return <img src={off ? "/icons/invisible.svg" : "/icons/visible.svg"} alt={off ? "隐藏密码" : "显示密码"} className="h-4 w-4 opacity-70" />;
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();

  const [siteName, setSiteName] = useState("BestEmby");
  const [siteDescription, setSiteDescription] = useState("See the BestEmby");
  const [siteLogoDataUrl, setSiteLogoDataUrl] = useState<string | null>(null);

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [strongPassword, setStrongPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdVisible, setPwdVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/site-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.data) return;
        setSiteName(j.data.siteName || "BestEmby");
        setSiteDescription(j.data.siteDescription || "See the BestEmby");
        setSiteLogoDataUrl(j.data.siteLogoDataUrl ?? null);
      })
      .catch(() => null);

    fetch("/api/public/security-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setStrongPassword(!!j?.data?.strongPassword))
      .catch(() => null);
  }, []);

  useEffect(() => {
    async function checkToken() {
      setChecking(true);
      setTokenError(null);
      setTokenValid(false);

      if (!token) {
        setChecking(false);
        setTokenError("重置链接无效，请重新发起找回密码");
        return;
      }

      try {
        const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setTokenError(json?.error === "token_invalid_or_expired" ? "重置链接无效或已过期，请重新获取" : "重置链接校验失败");
          return;
        }

        setTokenValid(true);
      } finally {
        setChecking(false);
      }
    }

    checkToken();
  }, [token]);

  const passwordErrors = useMemo(() => {
    const list: string[] = [];
    if (!password) return list;

    if (strongPassword) {
      if (password.length < 10 || password.length > 32) list.push("密码必须为10-32个字符");
      if (!/[a-z]/.test(password)) list.push("密码必须包含小写字母");
      if (!/[A-Z]/.test(password)) list.push("密码必须包含大写字母");
      if (!/[0-9]/.test(password)) list.push("密码必须包含数字");
      if (!/[^A-Za-z0-9]/.test(password)) list.push("密码必须包含特殊字符");
    } else {
      if (password.length < 8) list.push("密码至少8个字符");
      if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) list.push("密码需包含至少一个字母和一个数字");
    }

    return Array.from(new Set(list));
  }, [password, strongPassword]);

  const confirmError = confirmPassword && confirmPassword !== password ? "两次输入的密码不一致" : null;
  const canSubmit = tokenValid && !!password && !passwordErrors.length && !!confirmPassword && !confirmError;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (json?.error === "token_invalid_or_expired") setSubmitError("重置链接无效或已过期，请重新获取");
        else if (json?.error === "weak_password") setSubmitError("密码复杂度不符合系统要求");
        else if (json?.error === "confirm_password_mismatch") setSubmitError("两次输入的密码不一致");
        else setSubmitError("重置密码失败，请稍后重试");
        return;
      }

      setSubmitSuccess("密码重置成功，请使用新密码登录");
      setPassword("");
      setConfirmPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f5f7] flex items-center justify-center p-6">
      <div className="w-full max-w-[500px] bg-white rounded-2xl border border-[#eaeaea] shadow-sm p-5">
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <img src={siteLogoDataUrl || "/logo.png"} alt="logo" className="h-10 w-10 rounded-full object-cover" />
            <div className="text-2xl font-semibold tracking-tight">{siteName}</div>
          </div>
          <p className="text-[#888] mt-1 text-sm">{siteDescription}</p>
        </div>

        {checking ? (
          <div className="mt-4 max-w-3xl mx-auto px-4 text-sm text-[#666] text-center">正在校验重置链接...</div>
        ) : null}

        {!checking && !tokenValid ? (
          <div className="mt-4 max-w-3xl mx-auto px-4 text-center space-y-2">
            <div className="text-sm text-[#e3001b]">{tokenError || "重置链接无效"}</div>
            <Link href="/forgot-password" className="text-sm text-[#e3001b] hover:underline">
              重新获取重置链接
            </Link>
          </div>
        ) : null}

        {!checking && tokenValid ? (
          <form onSubmit={submit} className="mt-4 max-w-3xl mx-auto px-4 space-y-3">
            <div className="text-center text-2xl font-semibold text-[#222]">重置密码</div>
            <div className="text-center text-[#888] text-sm">请输入新的登录密码</div>

            <div className={`border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2 ${passwordErrors.length ? "border-red-300" : ""}`}>
              <img src="/icons/lock.svg" alt="密码" className="h-4 w-4 opacity-60" />
              <input
                type={pwdVisible ? "text" : "password"}
                className="w-full text-sm outline-none"
                placeholder="请输入新密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" onClick={() => setPwdVisible((v) => !v)}>
                <EyeIcon off={!pwdVisible} />
              </button>
            </div>

            {passwordErrors.map((x) => (
              <div key={x} className="text-red-500 text-xs">{x}</div>
            ))}

            <div className={`border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2 ${confirmError ? "border-red-300" : ""}`}>
              <img src="/icons/lock.svg" alt="确认密码" className="h-4 w-4 opacity-60" />
              <input
                type={confirmVisible ? "text" : "password"}
                className="w-full text-sm outline-none"
                placeholder="请再次输入新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button type="button" onClick={() => setConfirmVisible((v) => !v)}>
                <EyeIcon off={!confirmVisible} />
              </button>
            </div>

            {confirmError ? <div className="text-red-500 text-xs">{confirmError}</div> : null}
            {submitError ? <div className="text-red-500 text-xs">{submitError}</div> : null}
            {submitSuccess ? <div className="text-green-600 text-xs">{submitSuccess}</div> : null}

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="w-full bg-[#e3001b] hover:bg-[#c20017] text-white rounded-xl py-2.5 text-base font-semibold disabled:opacity-60"
            >
              {submitting ? "提交中..." : "确认重置"}
            </button>

            <div className="text-center text-[#888] text-sm">
              <Link href="/login" className="hover:text-[#e3001b]">← 返回登录</Link>
            </div>
          </form>
        ) : null}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f4f5f7] flex items-center justify-center text-[#666]">加载中...</main>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
