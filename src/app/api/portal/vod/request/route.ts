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
  note: z.string().max(20).optional(),
});

function shanghaiDayStart(now = new Date()) {
  const ms = now.getTime() + 8 * 3600 * 1000;
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 8 * 3600 * 1000);
}

function deriveBizStatus(row: { status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; bizStatus?: "PENDING" | "NO_RESOURCE" | "PROCESSING" | "CANNOT_UPDATE" | "COMPLETED" | null; adminNote?: string | null }) {
  if (row.bizStatus) return row.bizStatus;
  const note = (row.adminNote || "").trim();
  if (row.status === "APPROVED") return "COMPLETED" as const;
  if (row.status === "CANCELLED") return "PROCESSING" as const;
  if (row.status === "PENDING") return "PENDING" as const;
  if (note.includes("无法更新")) return "CANNOT_UPDATE" as const;
  return "NO_RESOURCE" as const;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username as string | undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      subscriptions: {
        where: { status: "ACTIVE", endAt: { gt: new Date() }, planId: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = dbUser.id;
  if (!dbUser.subscriptions?.length) {
    return NextResponse.json({ error: "subscription_required", message: "无有效订阅计划，无法提交点播申请" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const { tmdbId, mediaType, title, titleOriginal, posterPath, year, season, note } = parsed.data;

  const settingRow = await prisma.appSetting.findUnique({ where: { key: "vod_settings" } });
  const settings = (settingRow?.valueJson as any) ?? {};
  const enabled = Boolean(settings.enabled ?? false);
  if (!enabled) return NextResponse.json({ error: "vod_disabled", message: "目前点播功能暂未开启" }, { status: 403 });
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
    data: { userId, tmdbId, mediaType, title, titleOriginal, posterPath: posterPath ?? null, year: year ?? null, season: season ?? null, note: note ?? null, bizStatus: "PENDING" },
  });

  return NextResponse.json({ ok: true, id: request.id });
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username as string | undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = dbUser.id;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const pageSize = Math.max(1, Math.min(30, Number(url.searchParams.get("pageSize") || "10") || 10));

  const where = { userId };
  const [total, rows] = await Promise.all([
    prisma.vodRequest.count({ where }),
    prisma.vodRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, title: true, titleOriginal: true, mediaType: true, season: true, status: true, bizStatus: true, createdAt: true, adminNote: true, posterPath: true, year: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    rows: rows.map((r) => ({
      ...r,
      bizStatus: deriveBizStatus({ status: r.status, bizStatus: (r as any).bizStatus, adminNote: r.adminNote }),
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username as string | undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await prisma.vodRequest.deleteMany({
    where: { userId: dbUser.id, OR: [{ bizStatus: "COMPLETED" }, { status: "APPROVED" }] },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
