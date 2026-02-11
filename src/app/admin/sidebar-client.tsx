"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Item({ href, label, onNavigate }: { href: string; label: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={
        "block px-3 py-2.5 rounded-lg transition-colors " +
        (active ? "bg-blue-600 text-white" : "text-white/90 hover:bg-white/10")
      }
    >
      {label}
    </Link>
  );
}

export function AdminSidebarClient({
  username,
  siteName,
  siteLogoDataUrl,
  className,
  onNavigate,
}: {
  username: string;
  siteName: string;
  siteLogoDataUrl: string | null;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <aside className={(className ?? "fixed inset-y-0 left-0 w-60") + " bg-[#0b1220] text-white flex flex-col"}>
      <div className="h-16 flex items-center justify-center px-3 border-b border-white/10">
        <Link href="/admin" className="flex items-center gap-2 min-w-0">
          {siteLogoDataUrl ? <img src={siteLogoDataUrl} alt="logo" className="h-8 w-8 rounded-full object-cover shrink-0" /> : null}
          <span className="font-semibold text-2xl tracking-wide leading-none text-center truncate">{siteName}</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 text-sm">
        <div className="space-y-1">
          <Item href="/admin" label="仪表盘" onNavigate={onNavigate} />
        </div>

        <div className="my-3 border-t border-white/10" />

        <div className="space-y-1">
          <Item href="/admin/users" label="用户管理" onNavigate={onNavigate} />
          <Item href="/admin/subscriptions" label="订阅管理" onNavigate={onNavigate} />
          <Item href="/admin/servers" label="Emby 服务器" onNavigate={onNavigate} />
          <Item href="/admin/monitoring" label="统计监控" onNavigate={onNavigate} />
        </div>

        <div className="my-3 border-t border-white/10" />

        <div className="space-y-1">
          <Item href="/admin/cards" label="卡密管理" onNavigate={onNavigate} />
          <Item href="/admin/settings" label="系统设置" onNavigate={onNavigate} />
        </div>

        <div className="my-3 border-t border-white/10" />
      </nav>

      <div className="p-3 border-t border-white/10 text-xs text-white/70">{username}</div>
    </aside>
  );
}
