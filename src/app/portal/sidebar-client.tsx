"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Item({ href, label, collapsed }: { href: string; label: string; collapsed?: boolean }) {
  const pathname = usePathname();
  const active = href === "/portal" ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      title={label}
      className={
        "px-4 py-3.5 rounded-lg transition-colors flex items-center " +
        (active ? "bg-[#fff0f1] text-[#e3001b] font-bold" : "text-[#888] hover:bg-[#f4f5f7] hover:text-[#222]") +
        (collapsed ? " justify-center" : "")
      }
    >
      {!collapsed ? <span className="text-[15px] leading-6">{label}</span> : <span className="text-[13px] leading-5">{label.slice(0, 1)}</span>}
    </Link>
  );
}

export function PortalSidebarClient({ collapsed, siteName, className }: { collapsed?: boolean; siteName: string; siteLogoDataUrl: string | null; className?: string }) {
  return (
    <aside className={(collapsed ? "w-16" : "w-60") + " fixed inset-y-0 left-0 bg-white text-gray-700 border-r border-gray-200 flex flex-col z-30 " + (className || "")}>
      <div className="h-16 flex items-center px-5 border-b border-gray-200">
        <Link href="/portal" className="flex items-center gap-3 min-w-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#e3001b] text-white font-bold text-base shrink-0">B</span>
          {!collapsed ? <span className="font-bold text-[18px] tracking-wide leading-none text-[#111] truncate">{(siteName || "BESTEMBY").toUpperCase()}</span> : null}
        </Link>
      </div>

      <nav className="flex-1 px-4 py-5 text-sm">
        <div className="space-y-2">
          <Item href="/portal" label="仪表盘" collapsed={collapsed} />
          <Item href="/portal/purchase" label="购买服务" collapsed={collapsed} />
          <Item href="/portal/invites" label="我的邀请" collapsed={collapsed} />
          <Item href="/portal/emby-services" label="Emby 服务" collapsed={collapsed} />
          <Item href="/portal/vod" label="点播功能" collapsed={collapsed} />
          <Item href="/portal/playback-stats" label="播放统计" collapsed={collapsed} />
          <Item href="/portal/docs" label="使用文档" collapsed={collapsed} />
        </div>
      </nav>
    </aside>
  );
}
