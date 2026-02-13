"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Item({ href, label, icon, collapsed }: { href: string; label: string; icon: string; collapsed?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      title={label}
      className={
        "px-3 py-2.5 rounded-lg transition-colors flex items-center gap-2 " +
        (active ? "bg-blue-600 text-white" : "text-white/90 hover:bg-white/10") +
        (collapsed ? " justify-center" : "")
      }
    >
      <img src={icon} alt="" className="h-4 w-4 shrink-0 invert opacity-90" />
      {!collapsed ? <span>{label}</span> : null}
    </Link>
  );
}

export function AdminSidebarClient({
  username,
  siteName,
  siteLogoDataUrl,
  collapsed,
}: {
  username: string;
  siteName: string;
  siteLogoDataUrl: string | null;
  collapsed?: boolean;
}) {
  return (
    <aside className={(collapsed ? "w-16" : "w-60") + " fixed inset-y-0 left-0 bg-[#0b1220] text-white flex flex-col z-30"}>
      <div className="h-16 flex items-center justify-center px-2 border-b border-white/10">
        <Link href="/admin" className="flex items-center gap-2 min-w-0">
          <img src={siteLogoDataUrl || "/logo.png"} alt="logo" className="h-8 w-8 rounded-full object-cover shrink-0" />
          {!collapsed ? <span className="font-semibold text-2xl tracking-wide leading-none text-center truncate">{siteName || "EmbyPanel"}</span> : null}
        </Link>
      </div>

      <nav className="flex-1 p-2 text-sm">
        <div className="space-y-1">
          <Item href="/admin" label="仪表盘" icon="/icons/dashboard.svg" collapsed={collapsed} />
        </div>

        <div className="my-3 border-t border-white/10" />

        <div className="space-y-1">
          <Item href="/admin/users" label="用户管理" icon="/icons/users.svg" collapsed={collapsed} />
          <Item href="/admin/subscriptions" label="订阅管理" icon="/icons/subscriptions.svg" collapsed={collapsed} />
          <Item href="/admin/servers" label="Emby 服务器" icon="/icons/servers.svg" collapsed={collapsed} />
          <Item href="/admin/monitoring" label="统计监控" icon="/icons/monitoring.svg" collapsed={collapsed} />
        </div>

        <div className="my-3 border-t border-white/10" />

        <div className="space-y-1">
          <Item href="/admin/cards" label="卡密管理" icon="/icons/cards.svg" collapsed={collapsed} />
          <Item href="/admin/announcements" label="公告管理" icon="/icons/announcements.svg" collapsed={collapsed} />
          <Item href="/admin/settings" label="系统设置" icon="/icons/settings.svg" collapsed={collapsed} />
        </div>

        <div className="my-3 border-t border-white/10" />
      </nav>

      <div className="p-3 border-t border-white/10 text-xs text-white/70 text-center">{collapsed ? (username || "U").slice(0, 1) : username}</div>
    </aside>
  );
}
