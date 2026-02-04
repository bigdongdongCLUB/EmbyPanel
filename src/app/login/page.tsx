"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LoginRedirect } from "./login-redirect";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <LoginRedirect />
      <div className="w-full max-w-sm border rounded-lg p-6">
        <h1 className="text-xl font-semibold">登录</h1>
        <p className="text-sm text-gray-500 mt-1">使用用户名 + 密码登录</p>

        <form
          className="mt-6 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const res = await signIn("credentials", {
              username,
              password,
              redirect: false,
            });
            if ((res as any)?.error) {
              setError((res as any).error);
              return;
            }
            router.push("/");
            router.refresh();
          }}
        >
          <div>
            <label className="text-sm">Username</label>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              type="text"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="text-sm">Password</label>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <button className="w-full bg-black text-white rounded px-3 py-2">登录</button>
        </form>

        <p className="mt-4 text-xs text-gray-500">
          还没有账号？先调用 <code className="px-1">/api/auth/register</code> 注册（MVP）。
        </p>
      </div>
    </main>
  );
}
