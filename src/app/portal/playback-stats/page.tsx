import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalPlaybackStatsClient } from "./playback-stats-client";

export default async function PortalPlaybackStatsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <PortalPlaybackStatsClient />;
}
