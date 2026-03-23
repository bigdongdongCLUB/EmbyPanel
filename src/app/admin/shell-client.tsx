"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { AdminLogModal } from "./log-modal";

export function AdminShellClient({ username }: { username: string }) {
  const initials = (username || "AD").slice(0, 2).toUpperCase();
  const [open, setOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!open) return;
      const n = e.target as Node;
      if (!ref.current?.contains(n)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-center gap-3">
      <button
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-transparent text-[#666] transition hover:text-[#222]"
        onClick={() => setLogOpen(true)}
        title="系统日志"
        aria-label="系统日志"
      >
        <img src="/icons/log.svg" alt="" aria-hidden="true" className="h-[18px] w-[18px]" />
      </button>

      <button className="cursor-pointer select-none flex items-center gap-2 rounded-full px-2 py-1 hover:bg-gray-100" onClick={() => setOpen((v) => !v)}>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400 text-white text-sm font-semibold">
          {initials}
        </span>
        <span className="text-sm text-gray-800">{username}</span>
      </button>

      {open ? (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border rounded-xl shadow-lg p-1 z-30">
          <Link href="/portal" className="block px-3 py-2 rounded hover:bg-gray-50 text-sm font-normal leading-5" onClick={() => setOpen(false)}>
            用户中心
          </Link>
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

      {logOpen ? <AdminLogModal onClose={() => setLogOpen(false)} /> : null}
    </div>
  );
}
