import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

import { AdminHeader } from "../admin-header";
import { UsersClient } from "./users-client";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any).role;
  if (role !== "ADMIN") redirect("/admin");

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-4">
      <AdminHeader />

      <div>
        <h1 className="text-xl font-semibold">用户管理</h1>
        <p className="mt-2 text-gray-600">统一管理面板用户与其绑定的 Emby 用户。无数据则以 - 表示。</p>
      </div>

      <div className="mt-6">
        <UsersClient />
      </div>
    </main>
  );
}
