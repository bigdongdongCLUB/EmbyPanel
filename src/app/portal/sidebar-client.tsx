"use client";

import { UiImage } from "@/components/ui-image";
import Link from "next/link";
import { usePathname } from "next/navigation";

function Item({ href, label, icon, collapsed }: { href: string; label: string; icon: string; collapsed?: boolean }) {
  const pathname = usePathname();
  const active = href === "/portal" ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      title={label}
      className={
        "rounded-lg transition-colors flex items-center " +
        (collapsed ? "w-10 h-10 mx-auto justify-center" : "px-4 py-3.5 gap-2.5") +
        " " +
        (active ? "bg-[#fff0f1] text-[#e3001b] font-bold" : "text-[#888] hover:bg-[#f4f5f7] hover:text-[#222]")
      }
    >
      <UiImage src={icon} alt="" className={"h-4 w-4 shrink-0 " + (active ? "opacity-90" : "opacity-80")} />
      {!collapsed ? <span className="text-[15px] leading-6">{label}</span> : null}
    </Link>
  );
}

export function PortalSidebarClient({ collapsed, siteName, siteLogoDataUrl, appVersion, className }: { collapsed?: boolean; siteName: string; siteLogoDataUrl: string | null; appVersion: string; className?: string }) {
  return (
    <aside className={(collapsed ? "w-16" : "w-60") + " fixed inset-y-0 left-0 bg-white text-gray-700 border-r border-gray-200 flex flex-col z-30 " + (className || "")}>
      <div className="h-16 flex items-center px-5 border-b border-gray-200">
        <Link href="/portal" className="flex items-center gap-3 min-w-0">
          <UiImage src={siteLogoDataUrl || "/logo.png"} alt="logo" className="h-8 w-8 rounded-full object-cover shrink-0" />
          {!collapsed ? <span className="font-semibold text-[18px] tracking-wide leading-none text-[#111] truncate">{siteName || "EmbyPanel"}</span> : null}
        </Link>
      </div>

      <nav className="flex-1 px-4 py-5 text-sm">
        <div className="space-y-2">
          <Item href="/portal" label="仪表盘" icon="/icons/dashboard.svg" collapsed={collapsed} />
          <Item href="/portal/purchase" label="购买服务" icon="/icons/purchase.svg" collapsed={collapsed} />
          <Item href="/portal/invites" label="我的邀请" icon="/icons/invites.svg" collapsed={collapsed} />
          <Item href="/portal/emby-services" label="Emby 服务" icon="/icons/emby-services.svg" collapsed={collapsed} />
          <Item href="/portal/vod" label="点播功能" icon="/icons/vod.svg" collapsed={collapsed} />
          <Item href="/portal/playback-stats" label="播放统计" icon="/icons/playback-stats.svg" collapsed={collapsed} />
          <Item href="/portal/docs" label="使用文档" icon="/icons/docs.svg" collapsed={collapsed} />
        </div>
      </nav>

      <div className={"border-t border-gray-200 text-[#9aa0a6] " + (collapsed ? "py-2 px-1 text-[10px] text-center" : "px-5 py-3 text-xs")}>
        {appVersion}
      </div>
    </aside>
  );
}
