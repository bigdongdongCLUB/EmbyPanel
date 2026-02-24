export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const Schema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(["MOVIE", "TV"]),
  title: z.string().max(200),
  titleOriginal: z.string().max(200),
  posterPath: z.string().max(500).optional(),
  year: z.string().max(10).optional(),
  season: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
});

function shanghaiDayStart(now = new Date()) {
  const ms = now.getTime() + 8 * 3600 * 1000;
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 8 * 3600 * 1000);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username as string | undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = dbUser.id;

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const { tmdbId, mediaType, title, titleOriginal, posterPath, year, season, note } = parsed.data;

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

  if (mediaType === "MOVIE" && movieUsed >= dailyMovieQuota)
    return NextResponse.json({ error: "quota_exceeded", message: "今日电影点播配额已用完" }, { status: 429 });
  if (mediaType === "TV" && tvUsed >= dailyTvQuota)
    return NextResponse.json({ error: "quota_exceeded", message: "今日电视剧点播配额已用完" }, { status: 429 });

  const request = await prisma.vodRequest.create({
    data: { userId, tmdbId, mediaType, title, titleOriginal, posterPath: posterPath ?? null, year: year ?? null, season: season ?? null, note: note ?? null },
  });

  return NextResponse.json({ ok: true, id: request.id });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username as string | undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = dbUser.id;

  const rows = await prisma.vodRequest.findMany({
    where: { userId: userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, title: true, titleOriginal: true, mediaType: true, season: true, status: true, createdAt: true, adminNote: true, posterPath: true, year: true },
  });

  return NextResponse.json({ ok: true, rows });
}
