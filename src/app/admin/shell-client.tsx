"use client";

import { signOut } from "next-auth/react";

export function AdminShellClient() {
  return (
    <button className="text-sm border rounded px-3 py-2" onClick={() => signOut({ callbackUrl: "/login" })}>
      登出
    </button>
  );
}
