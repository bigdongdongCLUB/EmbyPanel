import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { MonitoringTabs } from "../tabs";
import { AdminPlaybackStatsClient } from "./playback-client";

export default async function AdminMonitoringPlaybackPage() {
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
        <p className="text-sm text-gray-600">播放统计：按用户名搜索并查看该用户的播放记录（默认每页10条）。</p>
      </div>

      <AdminPlaybackStatsClient />
    </div>
  );
}
