import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

import { UsersClient } from "./users-client";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any).role;
  if (role !== "ADMIN") redirect("/admin");

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">用户管理</h1>
      <p className="text-sm text-gray-600">统一管理面板用户与其绑定的 Emby 用户。</p>

      <div className="mt-4">
        <UsersClient />
      </div>
    </div>
  );
}
