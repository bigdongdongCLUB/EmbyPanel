export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { GET as readVodDetail } from "../detail/route";
import { isVodContentInLibrary } from "@/lib/vod-library-status";
import { getVodPoints, lockVodPointUser, vodPointCost, vodPointPeriod } from "@/lib/vod-points";
import { getDailyVodSubmissions, recordDeletedVodSubmission } from "@/lib/vod-daily-limit";

const Schema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(["MOVIE", "TV"]),
  title: z.string().max(200),
  titleOriginal: z.string().max(200),
  posterPath: z.string().max(500).nullable().optional(),
  year: z.string().max(10).optional(),
  season: z.number().int().positive().optional(),
  note: z.string().max(120).optional(),
  inLibraryConfirmed: z.boolean().optional(),
});

type SessionWithUsername = { username?: string | null };
type VodSettings = {
  enabled?: boolean;
  tmdbApiKey?: string;
};

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
  const username = (session as SessionWithUsername)?.username ?? undefined;
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

  const { tmdbId, mediaType, title, titleOriginal, posterPath, season, note, inLibraryConfirmed } = parsed.data;

  const settingRow = await prisma.appSetting.findUnique({ where: { key: "vod_settings" } });
  const settings = (settingRow?.valueJson ?? {}) as VodSettings;
  const enabled = Boolean(settings.enabled ?? false);
  if (!enabled) return NextResponse.json({ error: "vod_disabled", message: "目前点播功能暂未开启" }, { status: 403 });

  if ((await getDailyVodSubmissions(prisma, userId)).dailyRemaining === 0) {
    return NextResponse.json({ error: "daily_submission_limit", message: "本日可用申请次数已用完，请明日再提交" }, { status: 429 });
  }

  if (mediaType === "TV" && !season) return NextResponse.json({ error: "season_required", message: "请选择电视剧季" }, { status: 400 });
  const detailUrl = new URL("/api/portal/vod/detail", req.url);
  detailUrl.searchParams.set("tmdb_id", String(tmdbId));
  detailUrl.searchParams.set("media_type", mediaType.toLowerCase());
  const detailResponse = await readVodDetail(new Request(detailUrl));
  if (!detailResponse.ok) return NextResponse.json({ error: "library_check_failed", message: "入库状态查询失败，请稍后重试" }, { status: 503 });
  const detailData = await detailResponse.json() as {
    detail: { year: string; seasons: Array<{ seasonNumber: number; year?: string | null }> };
    serverResults: Array<{ hasMovie: boolean; seasons: Record<number, boolean> }>;
  };
  const selectedSeason = detailData.detail.seasons.find((item) => item.seasonNumber === season);
  if (mediaType === "TV" && !selectedSeason) return NextResponse.json({ error: "invalid_season", message: "电视剧季信息无效" }, { status: 400 });
  const releaseYear = detailData.detail.year || null;
  const inLibrary = isVodContentInLibrary(mediaType, detailData.serverResults, season);
  if (inLibrary && !inLibraryConfirmed) {
    return NextResponse.json({ error: "in_library_confirmation_required", message: "该内容已入库，你确定再次提交吗？" }, { status: 409 });
  }
  const cost = inLibrary ? 0 : vodPointCost(mediaType, mediaType === "TV" ? selectedSeason?.year : releaseYear);
  try {
    const request = await prisma.$transaction(async (tx) => {
      await lockVodPointUser(tx, userId);
      const existingRequest = await tx.vodRequest.findFirst({
        where: mediaType === "TV"
          ? { userId, tmdbId, mediaType, season: season ?? null, userDeletedAt: null }
          : { userId, tmdbId, mediaType, userDeletedAt: null },
        select: { id: true },
      });
      if (existingRequest) throw new Error("duplicate_vod_request");
      const now = new Date();
      if ((await getDailyVodSubmissions(tx, userId, now)).dailyRemaining === 0) throw new Error("daily_submission_limit");
      const balance = await getVodPoints(tx, userId, now);
      if (balance.available < cost) throw new Error("vod_points_insufficient");
      const request = await tx.vodRequest.create({
        data: { userId, tmdbId, mediaType, title, titleOriginal, posterPath: posterPath ?? null, year: releaseYear, season: season ?? null, note: note ?? null, bizStatus: "PENDING", createdAt: now },
      });
      await tx.vodPointEntry.create({ data: { requestId: request.id, userId, cost, month: vodPointPeriod(now).month, state: cost === 0 ? "RELEASED" : "RESERVED", createdAt: now } });
      return request;
    });
    return NextResponse.json({ ok: true, id: request.id, pointCost: cost });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request_failed";
    if (message === "daily_submission_limit") return NextResponse.json({ error: message, message: "本日可用申请次数已用完，请明日再提交" }, { status: 429 });
    if (message === "duplicate_vod_request") return NextResponse.json({ error: message, message: "请勿重复点播" }, { status: 409 });
    if (message === "vod_points_insufficient") return NextResponse.json({ error: message, message: "本月可用积分不足，请等待下月重置或待处理点播释放积分" }, { status: 409 });
    throw error;
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as SessionWithUsername)?.username ?? undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = dbUser.id;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const pageSize = Math.max(1, Math.min(30, Number(url.searchParams.get("pageSize") || "10") || 10));

  const where = { userId, userDeletedAt: null };
  const [total, rows] = await Promise.all([
    prisma.vodRequest.count({ where }),
    prisma.vodRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, title: true, titleOriginal: true, mediaType: true, season: true, status: true, bizStatus: true, createdAt: true, adminNote: true, posterPath: true, year: true, note: true },
    }),
  ]);

  const pointEntries = await prisma.vodPointEntry.findMany({ where: { requestId: { in: rows.map((row) => row.id) }, userId } });
  const pointsByRequest = new Map(pointEntries.map((entry) => [entry.requestId, entry]));

  return NextResponse.json({
    ok: true,
    rows: rows.map((r) => ({
      ...r,
      pointCost: pointsByRequest.get(r.id)?.cost ?? null,
      pointState: pointsByRequest.get(r.id)?.state ?? null,
      pointMonth: pointsByRequest.get(r.id)?.month ?? null,
      bizStatus: deriveBizStatus({ status: r.status, bizStatus: r.bizStatus, adminNote: r.adminNote }),
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as SessionWithUsername)?.username ?? undefined;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!dbUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();

  // 用户侧软删除：管理员仍可查看，历史提交统计也继续保留。
  if (id) {
    const deleted = await prisma.$transaction(async (tx) => {
      await lockVodPointUser(tx, dbUser.id);
      const row = await tx.vodRequest.findFirst({ where: { id, userId: dbUser.id, userDeletedAt: null }, select: { id: true, userId: true, bizStatus: true, createdAt: true } });
      if (!row) return false;
      await recordDeletedVodSubmission(tx, row);
      await tx.vodPointEntry.updateMany({ where: { requestId: id, userId: dbUser.id, state: "RESERVED" }, data: { state: "RELEASED" } });
      await tx.vodRequest.update({ where: { id }, data: { userDeletedAt: new Date() } });
      return true;
    });
    if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: 1 });
  }

  // 清空已完成记录同样只对用户隐藏。
  const result = await prisma.vodRequest.updateMany({
    where: { userId: dbUser.id, userDeletedAt: null, OR: [{ bizStatus: "COMPLETED" }, { status: "APPROVED" }] },
    data: { userDeletedAt: new Date() },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
