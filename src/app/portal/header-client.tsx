"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

export function PortalHeaderClient({ username, role }: { username: string; role: string }) {
  const initials = (username || "U").slice(0, 2).toUpperCase();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!open) return;
      const target = e.target as Node;
      if (!rootRef.current?.contains(target)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="cursor-pointer select-none flex items-center gap-2 rounded-full px-2 py-1 hover:bg-gray-100"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400 text-white text-sm font-semibold">
          {initials}
        </span>
        <span className="text-sm text-gray-800">{username}</span>
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-44 bg-white border rounded-xl shadow-lg p-1 z-30">
          <button
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 text-sm font-normal leading-5"
            onClick={() => {
              window.dispatchEvent(new Event("portal:open-profile"));
              setOpen(false);
            }}
          >
            个人资料
          </button>

          {role === "ADMIN" ? (
            <Link href="/admin" className="block px-3 py-2 rounded hover:bg-gray-50 text-sm font-normal leading-5" onClick={() => setOpen(false)}>
              管理后台
            </Link>
          ) : null}

          <button
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 text-sm font-normal leading-5 text-red-600"
            onClick={() => {
              setOpen(false);
              signOut({ callbackUrl: "/login" });
            }}
          >
            退出登录
          </button>
        </div>
      ) : null}
    </div>
  );
}
