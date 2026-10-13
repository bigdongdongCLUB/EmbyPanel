export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVodPoints } from "@/lib/vod-points";
import { getDailyVodSubmissions } from "@/lib/vod-daily-limit";

export async function GET() {
  const session = await getServerSession(authOptions);
  const username = (session as { username?: string } | null)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();
  const [points, submissions] = await Promise.all([getVodPoints(prisma, user.id, now), getDailyVodSubmissions(prisma, user.id, now)]);
  return NextResponse.json({ ok: true, ...points, ...submissions });
}
