import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

import { PanelUsersClient } from "./users-client";

export default async function AdminPanelUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any).role;
  if (role !== "ADMIN") redirect("/admin");

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">面板账号</h1>
        <div className="text-sm">
          <Link className="underline" href="/admin">
            返回后台
          </Link>
        </div>
      </div>
      <p className="mt-2 text-gray-600">这里是登录 EmbyPanel 的账号（admin 等），不等同于 Emby 服务器用户。</p>

      <div className="mt-6">
        <PanelUsersClient />
      </div>
    </main>
  );
}
