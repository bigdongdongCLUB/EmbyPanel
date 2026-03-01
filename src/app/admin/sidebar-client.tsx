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
        "rounded-lg transition-colors flex items-center " +
        (collapsed ? "w-10 h-10 mx-auto justify-center" : "px-4 py-3.5 gap-2.5") +
        " " +
        (active ? "bg-[#fff0f1] text-[#e3001b] font-bold" : "text-[#888] hover:bg-[#f4f5f7] hover:text-[#222]")
      }
    >
      <img src={icon} alt="" className={"h-4 w-4 shrink-0 " + (active ? "opacity-90" : "opacity-80")} />
      {!collapsed ? <span className="text-[15px] leading-6">{label}</span> : null}
    </Link>
  );
}

export function AdminSidebarClient({
  siteName,
  siteLogoDataUrl,
  appVersion,
  collapsed,
  className,
}: {
  siteName: string;
  siteLogoDataUrl: string | null;
  appVersion: string;
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <aside className={(collapsed ? "w-16" : "w-60") + " fixed inset-y-0 left-0 bg-white text-gray-700 border-r border-gray-200 flex flex-col z-30 " + (className || "")}>
      <div className="h-16 flex items-center px-5 border-b border-gray-200">
        <Link href="/admin" className="flex items-center gap-3 min-w-0">
          <img src={siteLogoDataUrl || "/logo.png"} alt="logo" className="h-8 w-8 rounded-full object-cover shrink-0" />
          {!collapsed ? <span className="font-semibold text-[18px] tracking-wide leading-none text-[#111] truncate">{siteName || "EmbyPanel"}</span> : null}
        </Link>
      </div>

      <nav className="flex-1 px-4 py-5 text-sm overflow-y-auto">
        <div className="space-y-2">
          <Item href="/admin" label="仪表盘" icon="/icons/dashboard.svg" collapsed={collapsed} />
          <Item href="/admin/users" label="用户管理" icon="/icons/users.svg" collapsed={collapsed} />
          <Item href="/admin/subscriptions" label="订阅管理" icon="/icons/subscriptions.svg" collapsed={collapsed} />
          <Item href="/admin/servers" label="Emby 服务器" icon="/icons/servers.svg" collapsed={collapsed} />
          <Item href="/admin/monitoring" label="统计监控" icon="/icons/monitoring.svg" collapsed={collapsed} />
          <Item href="/admin/cards" label="卡密管理" icon="/icons/cards.svg" collapsed={collapsed} />
          <Item href="/admin/payments" label="支付管理" icon="/icons/payments.svg" collapsed={collapsed} />
          <Item href="/admin/orders" label="订单管理" icon="/icons/orders.svg" collapsed={collapsed} />
          <Item href="/admin/invites" label="邀请管理" icon="/icons/invite-manage.svg" collapsed={collapsed} />
          <Item href="/admin/vod-requests" label="点播管理" icon="/icons/vod.svg" collapsed={collapsed} />
          <Item href="/admin/docs" label="文档管理" icon="/icons/docs.svg" collapsed={collapsed} />
          <Item href="/admin/jobs" label="定时任务" icon="/icons/jobs.svg" collapsed={collapsed} />
          <Item href="/admin/announcements" label="公告管理" icon="/icons/announcements.svg" collapsed={collapsed} />
          <Item href="/admin/settings" label="系统设置" icon="/icons/settings.svg" collapsed={collapsed} />
        </div>
      </nav>

      <div className={"border-t border-gray-200 text-[#9aa0a6] " + (collapsed ? "py-2 px-1 text-[10px] text-center" : "px-5 py-3 text-xs")}>
        {appVersion}
      </div>
    </aside>
  );
}
