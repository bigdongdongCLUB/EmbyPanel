"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Item({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/portal" ? pathname === "/portal" : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={
        "block px-3 py-2.5 rounded-lg transition-colors " +
        (active ? "bg-blue-600 text-white" : "text-white/90 hover:bg-white/10")
      }
    >
      {label}
    </Link>
  );
}

export function PortalSidebarClient() {
  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-[#0b1220] text-white flex flex-col">
      <div className="h-16 flex items-center justify-center px-4 border-b border-white/10">
        <Link href="/portal" className="font-semibold text-3xl tracking-wide leading-none text-center">
          BestEmby
        </Link>
      </div>

      <nav className="flex-1 p-3 text-sm">
        <div className="space-y-1">
          <Item href="/portal" label="仪表盘" />
          <Item href="/portal/purchase" label="购买服务" />
          <Item href="/portal/emby-services" label="Emby 服务" />
        </div>
      </nav>
    </aside>
  );
}
