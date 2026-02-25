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
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    if (raw === "1") setCollapsed(true);
    else if (raw === "0") setCollapsed(false);
    else setCollapsed(window.innerWidth < 1024);

    const applyViewport = () => {
      const m = window.innerWidth < 1024;
      setIsMobile(m);
      if (m) setMobileOpen(false);
    };
    applyViewport();
    window.addEventListener("resize", applyViewport);
    return () => window.removeEventListener("resize", applyViewport);
  }, []);

  function toggle() {
    if (isMobile) return setMobileOpen((v) => !v);
    setCollapsed((v) => {
      const n = !v;
      localStorage.setItem(KEY, n ? "1" : "0");
      return n;
    });
  }

  return (
    <div className="panel-compact min-h-screen bg-gray-50">
      <AdminSidebarClient
        siteName={siteName}
        siteLogoDataUrl={siteLogoDataUrl}
        collapsed={isMobile ? false : collapsed}
        className={isMobile ? `transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}` : ""}
      />
      {isMobile && mobileOpen ? <div className="fixed inset-0 z-20 bg-black/30" onClick={() => setMobileOpen(false)} /> : null}

      <div className={isMobile ? "" : collapsed ? "pl-16" : "pl-60"}>
        <header className="sticky top-0 z-20 h-14 bg-white border-b flex items-center justify-between px-3 md:px-4">
          <button className="border rounded px-2 py-1 text-sm" onClick={toggle} title={isMobile ? (mobileOpen ? "收起菜单" : "展开菜单") : collapsed ? "展开菜单" : "收起菜单"}>
            <img src="/icons/menu.svg" alt="菜单" className="h-4 w-4" />
          </button>
          <AdminShellClient username={username} />
        </header>
        <main className="p-3 md:p-6">{children}</main>
      </div>
    </div>
  );
}
