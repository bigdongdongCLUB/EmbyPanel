"use client";

import { useState } from "react";
import { PortalSidebarClient } from "./sidebar-client";
import { PortalHeaderClient } from "./header-client";

export function PortalFrameClient({
  username,
  role,
  children,
}: {
  username: string;
  role: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalSidebarClient className="hidden md:flex" />

      {menuOpen ? (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMenuOpen(false)} />
          <PortalSidebarClient className="fixed inset-y-0 left-0 z-50 w-64 md:hidden" onNavigate={() => setMenuOpen(false)} />
        </>
      ) : null}

      <div className="md:pl-60">
        <header className="sticky top-0 z-30 h-14 bg-white border-b flex items-center justify-between px-3 md:px-4">
          <div className="flex items-center gap-2">
            <button className="md:hidden border rounded px-2 py-1 text-sm" onClick={() => setMenuOpen(true)}>
              菜单
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
