import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { SubscriptionsClient } from "./subscriptions-client";

export default async function AdminSubscriptionsPage() {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role;
  if (!session) redirect("/login");
  if (role !== "ADMIN") redirect("/admin");

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">订阅管理</h1>
      <p className="text-sm text-gray-600">创建订阅计划、定价、并为每个 Emby 服务器选择模板用户。</p>
      <div className="mt-4">
        <SubscriptionsClient />
      </div>
    </div>
  );
}
