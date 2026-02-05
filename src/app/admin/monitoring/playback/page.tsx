import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { MonitoringTabs } from "../tabs";
import { PlaybackStatsClient } from "./playback-client";

export default async function PlaybackStatsPage() {
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

      <div>
        <p className="text-sm text-gray-600">播放统计：统计指定服务器在时间范围内的活跃人数与播放量榜单（电影/剧集）。</p>
      </div>

      <PlaybackStatsClient />
    </div>
  );
}
