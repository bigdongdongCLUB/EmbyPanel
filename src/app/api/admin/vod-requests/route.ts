export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

function toInt(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const bizStatus = (url.searchParams.get("bizStatus") || "").trim();
  const mediaType = (url.searchParams.get("mediaType") || "").trim();
  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.max(1, Math.min(50, toInt(url.searchParams.get("pageSize"), 10)));

  const andWhere: any[] = [];
  if (["MOVIE", "TV"].includes(mediaType)) andWhere.push({ mediaType });

  if (["PENDING", "NO_RESOURCE", "PROCESSING", "CANNOT_UPDATE", "COMPLETED"].includes(bizStatus)) {
    andWhere.push({ bizStatus });
  }

  if (q) {
    andWhere.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { titleOriginal: { contains: q, mode: "insensitive" } },
        { note: { contains: q, mode: "insensitive" } },
        { user: { username: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  const where: any = andWhere.length ? { AND: andWhere } : {};

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    total,
    pending,
    noResource,
    processing,
    cannotUpdate,
    completed,
    recentTvCount,
    recentMovieCount,
    recentTopUserGroup,
    filteredTotal,
    rows,
  ] = await Promise.all([
    prisma.vodRequest.count(),
    prisma.vodRequest.count({ where: { bizStatus: "PENDING" } }),
    prisma.vodRequest.count({ where: { bizStatus: "NO_RESOURCE" } }),
    prisma.vodRequest.count({ where: { bizStatus: "PROCESSING" } }),
    prisma.vodRequest.count({ where: { bizStatus: "CANNOT_UPDATE" } }),
    prisma.vodRequest.count({ where: { bizStatus: "COMPLETED" } }),
    prisma.vodRequest.count({ where: { createdAt: { gte: since30 }, mediaType: "TV" } }),
    prisma.vodRequest.count({ where: { createdAt: { gte: since30 }, mediaType: "MOVIE" } }),
    prisma.vodRequest.groupBy({ by: ["userId"], where: { createdAt: { gte: since30 } }, _count: { _all: true }, orderBy: { _count: { userId: "desc" } }, take: 1 }),
    prisma.vodRequest.count({ where }),
    prisma.vodRequest.findMany({
      where,
      include: { user: { select: { id: true, username: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const topUserId = recentTopUserGroup?.[0]?.userId;
  const topUserCount = recentTopUserGroup?.[0]?._count?._all || 0;
  const topUser = topUserId
    ? await prisma.user.findUnique({ where: { id: topUserId }, select: { username: true, email: true } })
    : null;

  return NextResponse.json({
    ok: true,
    summary: {
      total,
      pending,
      noResource,
      processing,
      cannotUpdate,
      completed,
      recentTvCount,
      recentMovieCount,
      recentTopUser: topUser ? (topUser.username || topUser.email || "-") : "-",
      recentTopUserCount: topUserCount,
    },
    pagination: { page, pageSize, total: filteredTotal, totalPages: Math.max(1, Math.ceil(filteredTotal / pageSize)) },
    rows: rows.map((r) => ({
      id: r.id,
      tmdbId: r.tmdbId,
      mediaType: r.mediaType,
      title: r.title,
      titleOriginal: r.titleOriginal,
      posterPath: r.posterPath,
      year: r.year,
      season: r.season,
      status: r.status,
      bizStatus: (r as any).bizStatus,
      note: r.note,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      user: { id: r.user.id, username: r.user.username, email: r.user.email },
    })),
  });
}
