"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ForgotPasswordPage() {
  const [siteName, setSiteName] = useState("BestEmby");
  const [siteDescription, setSiteDescription] = useState("See the BestEmby");
  const [siteLogoDataUrl, setSiteLogoDataUrl] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError("请先输入邮箱");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (json?.error === "email_not_registered") setError("该邮箱尚未注册面板账户");
        else if (json?.error === "mail_not_configured") setError("邮件功能未配置，暂时无法找回密码");
        else setError("发送失败，请稍后重试");
        return;
      }

      setSuccess("重置邮件已发送，请查收邮箱");
    } finally {
      setLoading(false);
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

        <form className="mt-4 max-w-3xl mx-auto px-4 space-y-3" onSubmit={submit}>
          <div className="text-center text-2xl font-semibold text-[#222]">忘记密码</div>
          <div className="text-center text-[#888] text-sm">输入您的邮箱地址，我们将发送重置链接给您</div>

          <div className="border border-gray-200 rounded-xl px-3 py-1.5 flex items-center gap-2 mt-1">
            <img src="/icons/email.svg" alt="邮箱" className="h-4 w-4 opacity-60" />
            <input
              type="email"
              className="w-full text-sm outline-none"
              placeholder="请输入您的邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {error ? <div className="text-red-500 text-xs">{error}</div> : null}
          {success ? <div className="text-green-600 text-xs">{success}</div> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#e3001b] hover:bg-[#c20017] text-white rounded-xl py-2.5 text-base font-semibold disabled:opacity-60"
          >
            {loading ? "发送中..." : "发送重置邮件"}
          </button>

          <div className="text-center text-[#888] text-sm">
            <Link href="/login" className="hover:text-[#e3001b]">← 返回登录</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
