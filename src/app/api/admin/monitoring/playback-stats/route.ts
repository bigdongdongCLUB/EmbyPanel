export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { getPlaybackStatsForUsername, type PlaybackStatsRangeDays } from "@/lib/playback-stats";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const username = String(url.searchParams.get("username") || "").trim();
  if (!username) return NextResponse.json({ error: "username_required" }, { status: 400 });

  const rangeDays = Number(url.searchParams.get("rangeDays") ?? "7");
  if (![7, 30, 90].includes(rangeDays)) return NextResponse.json({ error: "invalid_range" }, { status: 400 });

  try {
    const data = await getPlaybackStatsForUsername({ username, rangeDays: rangeDays as PlaybackStatsRangeDays });
    return NextResponse.json({ ...data, username });
  } catch (e: any) {
    if (String(e?.message || "") === "not_found") {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "internal_error", message: String(e?.message || e) }, { status: 500 });
  }
}
