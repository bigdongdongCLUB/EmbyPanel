import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { MonitoringTabs } from "./tabs";
import { RealtimeMonitorClient } from "./realtime-client";

export default async function MonitoringPage() {
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
        <p className="text-sm text-gray-600">实时监控：服务器在线状态、正在播放数量、播放会话列表（默认 120 秒自动刷新）。</p>
      </div>

      <RealtimeMonitorClient />
    </div>
  );
}
