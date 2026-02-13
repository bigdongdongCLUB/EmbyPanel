"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Item({ href, label, icon, collapsed }: { href: string; label: string; icon: string; collapsed?: boolean }) {
  const pathname = usePathname();
  const active = href === "/portal" ? pathname === "/portal" : pathname === href || pathname.startsWith(href + "/");
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

export function PortalSidebarClient({ collapsed }: { collapsed?: boolean }) {
  return (
    <aside className={(collapsed ? "w-16" : "w-60") + " fixed inset-y-0 left-0 bg-[#0b1220] text-white flex flex-col z-30"}>
      <div className="h-16 flex items-center justify-center px-3 border-b border-white/10">
        <Link href="/portal" className="font-semibold text-3xl tracking-wide leading-none text-center">
          {collapsed ? "B" : "BestEmby"}
        </Link>
      </div>

      <nav className="flex-1 p-3 text-sm">
        <div className="space-y-1">
          <Item href="/portal" label="仪表盘" icon="/icons/dashboard.svg" collapsed={collapsed} />
          <Item href="/portal/purchase" label="购买服务" icon="/icons/purchase.svg" collapsed={collapsed} />
          <Item href="/portal/invites" label="我的邀请" icon="/icons/users.svg" collapsed={collapsed} />
          <Item href="/portal/emby-services" label="Emby 服务" icon="/icons/emby-services.svg" collapsed={collapsed} />
        </div>
      </nav>
    </aside>
  );
}
