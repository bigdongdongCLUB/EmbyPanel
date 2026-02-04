"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export function AdminHeader() {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link className="text-sm underline" href="/admin">
        管理后台
      </Link>
      <button
        className="text-sm border rounded px-3 py-1"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        登出
      </button>
    </div>
  );
}
