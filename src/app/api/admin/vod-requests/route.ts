export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

function toInt(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

function normText(v?: string | null) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function mediaGroupKey(row: {
  mediaType: "MOVIE" | "TV";
  tmdbId: number;
  title: string;
  titleOriginal: string;
  year: string | null;
  season: number | null;
}) {
  if (row.tmdbId) return `${row.mediaType}::tmdb:${row.tmdbId}::${row.season ?? ""}`;
  const titleKey = normText(row.titleOriginal) || normText(row.title) || "-";
  return `${row.mediaType}::title:${titleKey}::${row.year ?? ""}::${row.season ?? ""}`;
}

function containsQuery(value: string | null | undefined, q: string) {
  return String(value || "").toLowerCase().includes(q);
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const bizStatus = (url.searchParams.get("bizStatus") || "").trim();
  const mediaType = (url.searchParams.get("mediaType") || "").trim();
  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.max(1, Math.min(50, toInt(url.searchParams.get("pageSize"), 10)));

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
    allRows,
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
    prisma.vodRequest.findMany({
      where: ["MOVIE", "TV"].includes(mediaType) ? { mediaType: mediaType as "MOVIE" | "TV" } : undefined,
      include: { user: { select: { id: true, username: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const topUserId = recentTopUserGroup?.[0]?.userId;
  const topUserCount = recentTopUserGroup?.[0]?._count?._all || 0;
  const topUser = topUserId
    ? await prisma.user.findUnique({ where: { id: topUserId }, select: { username: true, email: true } })
    : null;

  const groupedMap = new Map<string, typeof allRows>();
  for (const row of allRows) {
    const key = mediaGroupKey({
      mediaType: row.mediaType,
      tmdbId: row.tmdbId,
      title: row.title,
      titleOriginal: row.titleOriginal,
      year: row.year,
      season: row.season,
    });
    const list = groupedMap.get(key);
    if (list) list.push(row);
    else groupedMap.set(key, [row]);
  }

  let groupedRows = Array.from(groupedMap.values()).map((group) => {
    const [latest, ...others] = group;
    return {
      id: latest.id,
      tmdbId: latest.tmdbId,
      mediaType: latest.mediaType,
      title: latest.title,
      titleOriginal: latest.titleOriginal,
      posterPath: latest.posterPath,
      year: latest.year,
      season: latest.season,
      status: latest.status,
      bizStatus: (latest as any).bizStatus,
      note: latest.note,
      adminNote: latest.adminNote,
      createdAt: latest.createdAt,
      user: { id: latest.user.id, username: latest.user.username, email: latest.user.email },
      requestCount: group.length,
      otherRequests: others.map((row) => ({
        id: row.id,
        status: row.status,
        bizStatus: (row as any).bizStatus,
        note: row.note,
        adminNote: row.adminNote,
        createdAt: row.createdAt,
        user: { id: row.user.id, username: row.user.username, email: row.user.email },
      })),
    };
  });

  if (["PENDING", "NO_RESOURCE", "PROCESSING", "CANNOT_UPDATE", "COMPLETED"].includes(bizStatus)) {
    groupedRows = groupedRows.filter((row) => row.bizStatus === bizStatus);
  }

  if (q) {
    groupedRows = groupedRows.filter((row) => {
      const mediaMatched =
        containsQuery(row.title, q) ||
        containsQuery(row.titleOriginal, q) ||
        containsQuery(row.year, q);
      if (mediaMatched) return true;

      const currentMatched =
        containsQuery(row.note, q) ||
        containsQuery(row.adminNote, q) ||
        containsQuery(row.user.username, q) ||
        containsQuery(row.user.email, q);
      if (currentMatched) return true;

      return row.otherRequests.some((item) =>
        containsQuery(item.note, q) ||
        containsQuery(item.adminNote, q) ||
        containsQuery(item.user.username, q) ||
        containsQuery(item.user.email, q)
      );
    });
  }

  const filteredTotal = groupedRows.length;
  const pagedRows = groupedRows.slice((page - 1) * pageSize, page * pageSize);

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
    rows: pagedRows,
  });
}
