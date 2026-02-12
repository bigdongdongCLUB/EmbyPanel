"use client";

import { useEffect, useState } from "react";
import { AdminShellClient } from "./shell-client";
import { AdminSidebarClient } from "./sidebar-client";

const KEY = "embypanel_admin_sidebar_collapsed";

export function AdminFrameClient({
  username,
  siteName,
  siteLogoDataUrl,
  children,
}: {
  username: string;
  siteName: string;
  siteLogoDataUrl: string | null;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    if (raw === "1") return setCollapsed(true);
    if (raw === "0") return setCollapsed(false);
    setCollapsed(window.innerWidth < 1024);
  }, []);

  function toggle() {
    setCollapsed((v) => {
      const n = !v;
      localStorage.setItem(KEY, n ? "1" : "0");
      return n;
    });
  }

  return (
    <div className="panel-compact min-h-screen bg-gray-50">
      <AdminSidebarClient username={username} siteName={siteName} siteLogoDataUrl={siteLogoDataUrl} collapsed={collapsed} />

      <div className={collapsed ? "pl-16" : "pl-60"}>
        <header className="sticky top-0 z-20 h-14 bg-white border-b flex items-center justify-between px-3 md:px-4">
          <button className="border rounded px-2 py-1 text-sm" onClick={toggle} title={collapsed ? "展开菜单" : "收起菜单"}>
            ☰
          </button>
          <AdminShellClient username={username} />
        </header>
        <main className="p-3 md:p-6">{children}</main>
      </div>
    </div>
  );
}
