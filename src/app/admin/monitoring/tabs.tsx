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
        "px-3 py-2 text-sm border-b-2 " +
        (active ? "border-black text-black" : "border-transparent text-gray-600 hover:text-black")
      }
    >
      {label}
    </Link>
  );
}

export function MonitoringTabs() {
  return (
    <div className="flex gap-2 border-b">
      <Tab href="/admin/monitoring" label="实时监控" />
      <Tab href="/admin/monitoring/anomalies" label="异常监控" />
      <Tab href="/admin/monitoring/penalties" label="处罚记录" />
    </div>
  );
}
