import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { MonitoringTabs } from "../tabs";
import { MonitoringPenaltiesClient } from "./penalties-client";

export default async function MonitoringPenaltiesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any)?.role;
  if (role !== "ADMIN") redirect("/portal");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">统计监控</h1>
      </div>

      <MonitoringTabs />

      <div>
        <p className="text-sm text-gray-600">处罚记录：查看异常处罚执行情况，并配置是否启用处罚和处罚时长。</p>
      </div>

      <MonitoringPenaltiesClient />
    </div>
  );
}
