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
  const status = (url.searchParams.get("status") || "").trim();
  const mediaType = (url.searchParams.get("mediaType") || "").trim();
  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.max(1, Math.min(50, toInt(url.searchParams.get("pageSize"), 10)));

  const where: any = {};
  if (["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(status)) where.status = status;
  if (["MOVIE", "TV"].includes(mediaType)) where.mediaType = mediaType;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { titleOriginal: { contains: q, mode: "insensitive" } },
      { note: { contains: q, mode: "insensitive" } },
      { user: { username: { contains: q, mode: "insensitive" } } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, pending, approved, rejected, rows] = await Promise.all([
    prisma.vodRequest.count({ where }),
    prisma.vodRequest.count({ where: { ...where, status: "PENDING" } }),
    prisma.vodRequest.count({ where: { ...where, status: "APPROVED" } }),
    prisma.vodRequest.count({ where: { ...where, status: "REJECTED" } }),
    prisma.vodRequest.findMany({
      where,
      include: { user: { select: { id: true, username: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    summary: { total, pending, processing: 0, completed: approved },
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
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
      note: r.note,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      user: { id: r.user.id, username: r.user.username, email: r.user.email },
    })),
  });
}
