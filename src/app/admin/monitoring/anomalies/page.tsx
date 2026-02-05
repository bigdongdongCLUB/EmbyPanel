import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { MonitoringTabs } from "../tabs";

export default async function MonitoringAnomaliesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any)?.role;
  if (role !== "ADMIN") redirect("/portal");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">统计监控</h1>
      </div>

      <MonitoringTabs />

      <div className="bg-white border rounded-lg p-4 text-sm text-gray-600">异常监控（开发中）</div>
    </div>
  );
}
