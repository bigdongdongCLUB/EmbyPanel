"use client";

import { useState } from "react";
import { AdminShellClient } from "./shell-client";
import { AdminSidebarClient } from "./sidebar-client";

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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebarClient username={username} siteName={siteName} siteLogoDataUrl={siteLogoDataUrl} className="hidden md:flex" />

      {menuOpen ? (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMenuOpen(false)} />
          <AdminSidebarClient
            username={username}
            siteName={siteName}
            siteLogoDataUrl={siteLogoDataUrl}
            className="fixed inset-y-0 left-0 z-50 w-64 md:hidden"
            onNavigate={() => setMenuOpen(false)}
          />
        </>
      ) : null}

      <div className="md:pl-60">
        <header className="sticky top-0 z-30 h-14 bg-white border-b flex items-center justify-between px-3 md:px-4">
          <button className="md:hidden border rounded px-2 py-1 text-sm" onClick={() => setMenuOpen(true)}>
            菜单
          </button>
          <div className="hidden md:block" />
          <AdminShellClient username={username} />
        </header>
        <main className="p-3 md:p-6">{children}</main>
      </div>
    </div>
  );
}
