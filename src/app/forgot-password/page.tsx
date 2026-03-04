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
    <main className="min-h-screen bg-[#f4f5f7] flex items-center justify-center p-5">
      <div className="w-full max-w-[440px] bg-white rounded-[20px] border border-[#eaeaea] p-10 shadow-[0_10px_30px_rgba(0,0,0,0.04)] text-center">
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src={siteLogoDataUrl || "/logo.png"} alt="logo" className="h-10 w-10 rounded-full object-cover" />
          <div className="text-[32px] font-bold text-[#222] leading-none">{siteName}</div>
        </div>

        <h1 className="text-2xl font-bold text-[#222]">忘记密码</h1>
        <p className="text-[15px] text-[#888] mt-3 mb-8 leading-6">输入您的邮箱地址，我们将发送重置链接给您</p>

        <form onSubmit={submit} className="space-y-6">
          <div className="border border-[#eaeaea] rounded-[999px] px-5 flex items-center focus-within:border-[#e3001b] focus-within:shadow-[0_0_0_3px_rgba(227,0,27,0.1)]">
            <img src="/icons/email.svg" alt="邮箱" className="h-5 w-5 opacity-60" />
            <input
              type="email"
              className="w-full bg-transparent outline-none px-3 py-4 text-base text-[#222]"
              placeholder="请输入您的邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {error ? <div className="text-sm text-[#e3001b] text-left">{error}</div> : null}
          {success ? <div className="text-sm text-green-600 text-left">{success}</div> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#e3001b] hover:bg-[#c20017] text-white rounded-[999px] py-4 text-base font-bold disabled:opacity-60"
          >
            {loading ? "发送中..." : "发送重置邮件"}
          </button>
        </form>

        <div className="mt-6">
          <Link href="/login" className="inline-flex items-center gap-1 text-[15px] text-[#888] hover:text-[#e3001b]">
            <span>←</span>
            <span>返回登录</span>
          </Link>
        </div>
        <div className="mt-2 text-xs text-[#aaa]">{siteDescription}</div>
      </div>
    </main>
  );
}
