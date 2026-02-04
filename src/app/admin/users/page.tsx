import Link from "next/link";
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
    <main className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">用户管理</h1>
        <div className="text-sm">
          <Link className="underline" href="/admin">
            返回后台
          </Link>
        </div>
      </div>
      <p className="mt-2 text-gray-600">无数据则以 - 表示。</p>

      <div className="mt-6">
        <UsersClient />
      </div>
    </main>
  );
}
