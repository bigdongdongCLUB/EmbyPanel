"use client";

import { useEffect, useState } from "react";
import { PortalSidebarClient } from "./sidebar-client";
import { PortalHeaderClient } from "./header-client";

const KEY = "embypanel_portal_sidebar_collapsed";

export function PortalFrameClient({ username, role, children }: { username: string; role: string; children: React.ReactNode }) {
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
      <PortalSidebarClient collapsed={collapsed} />

      <div className={collapsed ? "pl-16" : "pl-60"}>
        <header className="sticky top-0 z-20 h-14 bg-white border-b flex items-center justify-between px-3 md:px-4">
          <div className="flex items-center gap-2">
            <button className="border rounded px-2 py-1 text-sm" onClick={toggle} title={collapsed ? "展开菜单" : "收起菜单"}>
              ☰
            </button>
            <div className="text-sm text-gray-700">用户中心</div>
          </div>
          <PortalHeaderClient username={username} role={role} />
        </header>
        <main className="p-3 md:p-6">{children}</main>
      </div>
    </div>
  );
}
