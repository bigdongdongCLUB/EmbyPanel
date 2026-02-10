"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export function PortalHeaderClient({ username, role }: { username: string; role: string }) {
  const initials = (username || "U").slice(0, 2).toUpperCase();

  return (
    <details className="relative">
      <summary className="list-none cursor-pointer select-none flex items-center gap-2 rounded-full px-2 py-1 hover:bg-gray-100">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400 text-white text-sm font-semibold">
          {initials}
        </span>
        <span className="text-sm text-gray-800">{username}</span>
      </summary>

      <div className="absolute right-0 mt-2 w-44 bg-white border rounded-xl shadow-lg p-1 z-30">
        <Link href="/portal/profile" className="block px-3 py-2 rounded hover:bg-gray-50 text-sm">
          个人资料
        </Link>

        {role === "ADMIN" ? (
          <Link href="/admin" className="block px-3 py-2 rounded hover:bg-gray-50 text-sm">
            管理后台
          </Link>
        ) : null}

        <button
          className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 text-sm text-red-600"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          退出登录
        </button>
      </div>
    </details>
  );
}
