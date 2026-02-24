export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function shanghaiDayStart(now = new Date()) {
  const ms = now.getTime() + 8 * 3600 * 1000;
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 8 * 3600 * 1000);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username as string | undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = dbUser.id;

  const settingRow = await prisma.appSetting.findUnique({ where: { key: "vod_settings" } });
  const settings = (settingRow?.valueJson as any) ?? {};
  const dailyMovieQuota = Number(settings.dailyMovieQuota ?? 5);
  const dailyTvQuota = Number(settings.dailyTvQuota ?? 5);

  const dayStart = shanghaiDayStart();
  const todayRequests = await prisma.vodRequest.findMany({
    where: { userId, createdAt: { gte: dayStart }, status: { not: "CANCELLED" } },
    select: { mediaType: true },
  });

  const movieUsed = todayRequests.filter((r) => r.mediaType === "MOVIE").length;
  const tvUsed = todayRequests.filter((r) => r.mediaType === "TV").length;

  const nextReset = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const nextResetStr = nextReset.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric" });

  return NextResponse.json({
    ok: true,
    movieRemaining: Math.max(0, dailyMovieQuota - movieUsed),
    movieTotal: dailyMovieQuota,
    tvRemaining: Math.max(0, dailyTvQuota - tvUsed),
    tvTotal: dailyTvQuota,
    resetPeriod: "每天",
    nextReset: nextResetStr,
  });
}
