import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

import { ServersClient } from "./servers-client";

export default async function AdminServersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any).role;
  if (role !== "ADMIN") redirect("/admin");

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Emby 服务器</h1>
      <p className="text-sm text-gray-600">添加 Emby 服务器并测试连通性。</p>

      <div className="mt-4">
        <ServersClient />
      </div>
    </div>
  );
}
