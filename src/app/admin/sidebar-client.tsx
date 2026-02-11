"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Item({ href, label, collapsed }: { href: string; label: string; collapsed?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      title={label}
      className={
        "block px-3 py-2.5 rounded-lg transition-colors " +
        (active ? "bg-blue-600 text-white" : "text-white/90 hover:bg-white/10") +
        (collapsed ? " text-center" : "")
      }
    >
      {collapsed ? label.slice(0, 1) : label}
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
          {siteLogoDataUrl ? <img src={siteLogoDataUrl} alt="logo" className="h-8 w-8 rounded-full object-cover shrink-0" /> : null}
          {!collapsed ? <span className="font-semibold text-2xl tracking-wide leading-none text-center truncate">{siteName}</span> : null}
        </Link>
      </div>

      <nav className="flex-1 p-2 text-sm">
        <div className="space-y-1">
          <Item href="/admin" label="仪表盘" collapsed={collapsed} />
        </div>

        <div className="my-3 border-t border-white/10" />

        <div className="space-y-1">
          <Item href="/admin/users" label="用户管理" collapsed={collapsed} />
          <Item href="/admin/subscriptions" label="订阅管理" collapsed={collapsed} />
          <Item href="/admin/servers" label="Emby 服务器" collapsed={collapsed} />
          <Item href="/admin/monitoring" label="统计监控" collapsed={collapsed} />
        </div>

        <div className="my-3 border-t border-white/10" />

        <div className="space-y-1">
          <Item href="/admin/cards" label="卡密管理" collapsed={collapsed} />
          <Item href="/admin/settings" label="系统设置" collapsed={collapsed} />
        </div>

        <div className="my-3 border-t border-white/10" />
      </nav>

      <div className="p-3 border-t border-white/10 text-xs text-white/70 text-center">{collapsed ? (username || "U").slice(0, 1) : username}</div>
    </aside>
  );
}
