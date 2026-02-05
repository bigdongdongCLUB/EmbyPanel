import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PlaybackStatsClient } from "./playback-client";

export default async function PlaybackStatsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any)?.role;
  if (role !== "ADMIN") redirect("/portal");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">统计监控 / 播放统计</h1>
        <p className="mt-1 text-sm text-gray-600">统计指定服务器在时间范围内的活跃人数与播放量榜单（电影/剧集）。</p>
      </div>

      <PlaybackStatsClient />
    </div>
  );
}
