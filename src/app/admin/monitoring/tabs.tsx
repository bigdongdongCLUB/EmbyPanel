"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Tab({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={
        "pb-3 text-[15px] border-b-2 " +
        (active ? "border-[#e3001b] text-[#e3001b] font-bold" : "border-transparent text-[#888] hover:text-[#222]")
      }
    >
      {label}
    </Link>
  );
}

export function MonitoringTabs() {
  return (
    <div className="flex gap-8 border-b border-[#eaeaea]">
      <Tab href="/admin/monitoring" label="实时监控" />
      <Tab href="/admin/monitoring/anomalies" label="异常监控" />
      <Tab href="/admin/monitoring/penalties" label="处罚记录" />
      <Tab href="/admin/monitoring/playback" label="播放统计" />
    </div>
  );
}
