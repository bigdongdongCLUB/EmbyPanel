"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { LoginRedirect } from "./login-redirect";

type Mode = "login" | "register";

function EyeIcon({ off }: { off?: boolean }) {
  return <span className="text-gray-400 text-base leading-none">{off ? "🙈" : "👁️"}</span>;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginPwdVisible, setLoginPwdVisible] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [pwdVisible, setPwdVisible] = useState(false);
  const [confirmPwdVisible, setConfirmPwdVisible] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);

  const [openRegistration, setOpenRegistration] = useState(true);
  const [requireEmailVerification, setRequireEmailVerification] = useState(false);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [strongPassword, setStrongPassword] = useState(false);

  const [siteName, setSiteName] = useState("BestEmby");
  const [siteDescription, setSiteDescription] = useState("See the BestEmby");
  const [siteLogoDataUrl, setSiteLogoDataUrl] = useState<string | null>(null);

  const usernameErrors = useMemo(() => {
    const list: string[] = [];
    if (!username) return list;
    if (username.length < 5) list.push("用户名至少需要 5 个字符");
    if (username.length > 24) list.push("用户名不能超过 24 个字符");
    if (!/^[a-zA-Z0-9]+$/.test(username)) list.push("用户名只能包含字母或字母与数字的组合，不支持下划线、中文及其他符号");
    if (username.length >= 5 && /^[0-9]+$/.test(username)) list.push("用户名不能全为数字，需包含至少一个字母");
    return list;
  }, [username]);

  const passwordErrors = useMemo(() => {
    const list: string[] = [];
    if (strongPassword) {
      if (password && (password.length < 10 || password.length > 32)) list.push("密码必须为10-32个字符");
      if (password && !/[a-z]/.test(password)) list.push("密码必须包含小写字母");
      if (password && !/[A-Z]/.test(password)) list.push("密码必须包含大写字母");
      if (password && !/[0-9]/.test(password)) list.push("密码必须包含数字");
      if (password && !/[^A-Za-z0-9]/.test(password)) list.push("密码必须包含特殊字符");
    } else {
      if (password && password.length < 8) list.push("密码必须至少8个字符");
      if (password && !/[A-Za-z]/.test(password)) list.push("密码必须包含至少一个字母和一个数字");
      if (password && !/[0-9]/.test(password)) list.push("密码必须包含至少一个字母和一个数字");
    }
    return Array.from(new Set(list));
  }, [password, strongPassword]);

  const confirmError = confirmPassword && password !== confirmPassword ? "两次输入的密码不一致" : null;

  const canRegister =
    openRegistration &&
    !!username &&
    !usernameErrors.length &&
    !!password &&
    !passwordErrors.length &&
    !!confirmPassword &&
    !confirmError &&
    (!inviteOnly || !!inviteCode.trim()) &&
    (!requireEmailVerification || !!emailCode.trim());

  useEffect(() => {
    fetch("/api/public/site-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.data) return;
        setSiteName(j.data.siteName || "EmbyPanel");
        setSiteDescription(j.data.siteDescription || "See the BestEmby");
        setSiteLogoDataUrl(j.data.siteLogoDataUrl ?? null);
      })
      .catch(() => null);

    fetch("/api/public/security-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const d = j?.data || {};
        setOpenRegistration(d.openRegistration !== false);
        setRequireEmailVerification(!!d.requireEmailVerification);
        setInviteOnly(!!d.inviteOnly);
        setStrongPassword(!!d.strongPassword);
      })
      .catch(() => null);
  }, []);

  async function doLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const fd = new FormData(e.currentTarget);
      const u = String(fd.get("username") || loginUsername || "").trim();
      const p = String(fd.get("password") || loginPassword || "");

      const res = await signIn("credentials", {
        username: u,
        password: p,
        redirect: false,
        callbackUrl: "/",
      });

      if ((res as any)?.error || !(res as any)?.ok) {
        setLoginError("用户名或密码错误");
        return;
      }

      window.location.href = (res as any)?.url || "/";
    } finally {
      setLoginLoading(false);
    }
  }

  async function doRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!canRegister) return;
    setRegisterError(null);
    setRegisterLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim() || undefined,
          password,
          name: username.trim(),
          inviteCode: inviteCode.trim() || undefined,
          emailCode: emailCode.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (json?.error === "username_taken") setRegisterError("用户名已存在");
        else if (json?.error === "email_taken") setRegisterError("邮箱已被使用");
        else if (json?.error === "registration_closed") setRegisterError("当前已关闭注册");
        else if (json?.error === "invite_required") setRegisterError("当前仅限邀请码注册");
        else if (json?.error === "reserved_username") setRegisterError("该用户名为系统保留，无法注册");
        else if (json?.error === "weak_password") setRegisterError("密码复杂度不符合要求");
        else if (json?.error === "email_code_required") setRegisterError("请先输入邮箱验证码");
        else if (json?.error === "email_code_invalid") setRegisterError("邮箱验证码无效或已过期");
        else setRegisterError("注册失败，请检查输入后重试");
        return;
      }

      const loginRes = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false,
        callbackUrl: "/portal",
      });
      if ((loginRes as any)?.error || !(loginRes as any)?.ok) {
        setMode("login");
        setLoginUsername(username.trim());
        setLoginPassword("");
        setLoginError("注册成功，请登录");
        return;
      }

      window.location.href = (loginRes as any)?.url || "/portal";
    } finally {
      setRegisterLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <LoginRedirect />

      <div
        className={
          "w-full max-w-[450px] bg-white rounded-2xl shadow-sm p-3 " +
          (mode === "login" ? "h-[300px]" : "h-[450px] overflow-hidden")
        }
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            {siteLogoDataUrl ? (
              <img src={siteLogoDataUrl} alt="logo" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-9 w-9 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center font-bold">BigTv</div>
            )}
            <div className="text-2xl font-semibold tracking-tight">{siteName}</div>
          </div>
          <p className="text-gray-500 mt-1 text-sm">{siteDescription}</p>
        </div>

        {mode === "login" ? (
          <form className="mt-3 max-w-3xl mx-auto px-10 space-y-2" onSubmit={doLogin}>
            <div className="border rounded-xl px-3 py-1.5 flex items-center gap-2">
              <span className="text-gray-400 text-sm">👤</span>
              <input
                name="username"
                className="w-full text-sm outline-none"
                placeholder="用户名"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="border rounded-xl px-3 py-1.5 flex items-center gap-2">
              <span className="text-gray-400 text-sm">🔒</span>
              <input
                name="password"
                className="w-full text-sm outline-none"
                placeholder="密码"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                type={loginPwdVisible ? "text" : "password"}
                autoComplete="current-password"
                required
              />
              <button type="button" onClick={() => setLoginPwdVisible((v) => !v)}>
                <EyeIcon off={!loginPwdVisible} />
              </button>
            </div>

            {loginError ? <div className="text-red-500 text-xs">{loginError}</div> : null}

            <button className="w-full bg-blue-600 text-white rounded-xl py-2 text-base font-semibold disabled:opacity-60" disabled={loginLoading}>
              {loginLoading ? "登录中..." : "登 录"}
            </button>

            <div className="text-center text-blue-500 text-sm pt-0.5">忘记密码?</div>
            <div className="text-center text-sm">
              还没有账户？
              <button
                type="button"
                className={(openRegistration ? "text-blue-500" : "text-gray-400 cursor-not-allowed") + " ml-2"}
                onClick={() => {
                  if (!openRegistration) return;
                  setMode("register");
                }}
              >
                注册
              </button>
              {!openRegistration ? <span className="ml-2 text-gray-400 text-xs">（已关闭）</span> : null}
            </div>
          </form>
        ) : (
          <form className="mt-3 max-w-3xl mx-auto px-10 space-y-1.5" onSubmit={doRegister}>
            <div className={`border rounded-xl px-3 py-1.5 flex items-center gap-2 ${username && usernameErrors.length ? "border-red-300 bg-red-50" : ""}`}>
              <span className="text-gray-400 text-sm">👤</span>
              <input className="w-full text-sm outline-none bg-transparent" placeholder="用户名（5位以上字母或字母+数字）" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            {username && usernameErrors.length > 0 ? (
              <div className="border border-red-200 bg-red-50 rounded-lg px-3 py-2 space-y-0.5">
                {usernameErrors.map((x) => (
                  <div key={x} className="flex items-start gap-1.5 text-red-500 text-[11px]">
                    <span className="mt-0.5 shrink-0">✕</span>
                    <span>{x}</span>
                  </div>
                ))}
              </div>
            ) : username && !usernameErrors.length ? (
              <div className="flex items-center gap-1.5 text-green-600 text-[11px] px-1">
                <span>✓</span>
                <span>用户名格式正确</span>
              </div>
            ) : null}

            <div className="border rounded-xl px-3 py-1.5 flex items-center gap-2">
              <span className="text-gray-400 text-sm">✉️</span>
              <input className="w-full text-sm outline-none" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className={`border rounded-xl px-3 py-1.5 flex items-center gap-2 ${passwordErrors.length ? "border-red-300" : ""}`}>
              <span className="text-gray-400 text-sm">🔒</span>
              <input
                className="w-full text-sm outline-none"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={pwdVisible ? "text" : "password"}
              />
              <button type="button" onClick={() => setPwdVisible((v) => !v)}>
                <EyeIcon off={!pwdVisible} />
              </button>
            </div>
            {passwordErrors.map((x) => (
              <div key={x} className="text-red-500 text-[11px]">{x}</div>
            ))}
            <div className="text-gray-500 text-[11px]">ⓘ {strongPassword ? "10-32个字符，且包含大小写字母、数字和特殊字符" : "8-24个字符, 包含至少一个字母和一个数字"}</div>

            <div className={`border rounded-xl px-3 py-1.5 flex items-center gap-2 ${confirmError ? "border-red-300" : ""}`}>
              <span className="text-gray-400 text-sm">🔒</span>
              <input
                className="w-full text-sm outline-none"
                placeholder="确认密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type={confirmPwdVisible ? "text" : "password"}
              />
              <button type="button" onClick={() => setConfirmPwdVisible((v) => !v)}>
                <EyeIcon off={!confirmPwdVisible} />
              </button>
            </div>
            {confirmError ? <div className="text-red-500 text-[11px]">{confirmError}</div> : null}

            <div className="border rounded-xl px-3 py-1.5 flex items-center gap-2">
              <input
                className="w-full text-sm outline-none"
                placeholder={inviteOnly ? "邀请码（必填）" : "邀请码（选填）"}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </div>

            {requireEmailVerification ? (
              <div className="border rounded-xl px-3 py-1.5 flex items-center gap-2">
                <input className="w-full text-sm outline-none" placeholder="邮箱验证码" value={emailCode} onChange={(e) => setEmailCode(e.target.value)} />
                <button
                  type="button"
                  className="text-xs text-blue-600 whitespace-nowrap disabled:text-gray-400"
                  disabled={sendingCode || !email.trim()}
                  onClick={async () => {
                    if (!email.trim()) {
                      setRegisterError("请先填写邮箱");
                      return;
                    }
                    setSendingCode(true);
                    setRegisterError(null);
                    try {
                      const res = await fetch("/api/auth/register/send-code", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ email: email.trim() }),
                      });
                      const json = await res.json().catch(() => null);
                      if (!res.ok) {
                        setRegisterError(json?.error === "mail_not_configured" ? "邮件未配置，无法发送验证码" : "发送验证码失败");
                        return;
                      }
                      alert("验证码已发送，请查收邮箱");
                    } finally {
                      setSendingCode(false);
                    }
                  }}
                >
                  {sendingCode ? "发送中" : "发送验证码"}
                </button>
              </div>
            ) : null}

            {registerError ? <div className="text-red-500 text-[11px]">{registerError}</div> : null}

            <button className="w-full bg-blue-600 text-white rounded-xl py-2 text-base font-semibold disabled:opacity-60" disabled={!canRegister || registerLoading}>
              {!openRegistration ? "注册已关闭" : registerLoading ? "注册中..." : "注 册"}
            </button>

            <div className="text-center text-sm pt-0.5">
              已有账户？
              <button type="button" className="text-blue-500 ml-2" onClick={() => setMode("login")}>
                登录
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
