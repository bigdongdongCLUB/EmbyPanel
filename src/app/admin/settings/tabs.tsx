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

export function SettingsTabs() {
  return (
    <div className="flex gap-2 border-b">
      <Tab href="/admin/settings" label="基础设置" />
      <Tab href="/admin/settings/mail" label="邮件设置" />
      <Tab href="/admin/settings/mail-templates" label="邮件模板" />
      <Tab href="/admin/settings/security" label="安全设置" />
      <Tab href="/admin/settings/invite-rebate" label="邀请返利" />
    </div>
  );
}
