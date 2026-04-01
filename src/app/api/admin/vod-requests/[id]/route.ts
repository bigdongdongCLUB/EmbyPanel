export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const PatchSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  bizStatus: z.enum(["PENDING", "NO_RESOURCE", "PROCESSING", "CANNOT_UPDATE", "COMPLETED"]).optional(),
  adminNote: z.string().max(20).optional(),
});

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

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  console.log('[DELETE /api/admin/vod-requests/[id]] called');
  const auth = await requireAdmin();
  console.log('[DELETE /api/admin/vod-requests/[id]] auth result:', auth.ok ? 'ok' : auth.error);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  console.log('[DELETE /api/admin/vod-requests/[id]] id:', id);
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  console.log('[DELETE /api/admin/vod-requests/[id]] attempting to delete id:', id);
  const deleted = await prisma.vodRequest.delete({
    where: { id },
    select: { id: true },
  }).catch((err) => {
    console.error('[DELETE /api/admin/vod-requests/[id]] delete error:', err);
    return null;
  });

  if (!deleted) {
    console.log('[DELETE /api/admin/vod-requests/[id]] not found');
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  console.log('[DELETE /api/admin/vod-requests/[id]] deleted successfully:', deleted.id);
  return NextResponse.json({ ok: true, id: deleted.id });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const current = await prisma.vodRequest.findUnique({
    where: { id },
    select: {
      id: true,
      mediaType: true,
      tmdbId: true,
      title: true,
      titleOriginal: true,
      year: true,
      season: true,
      createdAt: true,
    },
  });
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const hasStatusChange = parsed.data.status !== undefined || parsed.data.bizStatus !== undefined;

  const updated = await prisma.$transaction(async (tx) => {
    if (!hasStatusChange) {
      return tx.vodRequest.update({
        where: { id },
        data: {
          ...(parsed.data.adminNote !== undefined ? { adminNote: parsed.data.adminNote || null } : {}),
        },
        select: { id: true, status: true, bizStatus: true, adminNote: true, updatedAt: true },
      });
    }

    const currentKey = mediaGroupKey(current);

    const candidates = current.tmdbId
      ? await tx.vodRequest.findMany({
          where: { mediaType: current.mediaType, tmdbId: current.tmdbId, season: current.season },
          select: {
            id: true,
            mediaType: true,
            tmdbId: true,
            title: true,
            titleOriginal: true,
            year: true,
            season: true,
            createdAt: true,
          },
        })
      : await tx.vodRequest.findMany({
          where: { mediaType: current.mediaType, year: current.year, season: current.season },
          select: {
            id: true,
            mediaType: true,
            tmdbId: true,
            title: true,
            titleOriginal: true,
            year: true,
            season: true,
            createdAt: true,
          },
        });

    const sameGroup = candidates.filter((r) => mediaGroupKey(r) === currentKey);

    const latest = sameGroup
      .slice()
      .sort((a, b) => {
        const dt = b.createdAt.getTime() - a.createdAt.getTime();
        if (dt !== 0) return dt;
        return b.id.localeCompare(a.id);
      })[0];

    const statusData: { status?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; bizStatus?: "PENDING" | "NO_RESOURCE" | "PROCESSING" | "CANNOT_UPDATE" | "COMPLETED" } = {};
    if (parsed.data.status !== undefined) statusData.status = parsed.data.status;
    if (parsed.data.bizStatus !== undefined) statusData.bizStatus = parsed.data.bizStatus;

    if (latest && latest.id === id && Object.keys(statusData).length > 0) {
      await tx.vodRequest.updateMany({
        where: { id: { in: sameGroup.map((r) => r.id) } },
        data: statusData,
      });
    } else {
      await tx.vodRequest.update({
        where: { id },
        data: statusData,
      });
    }

    if (parsed.data.adminNote !== undefined) {
      await tx.vodRequest.update({
        where: { id },
        data: { adminNote: parsed.data.adminNote || null },
      });
    }

    return tx.vodRequest.findUnique({
      where: { id },
      select: { id: true, status: true, bizStatus: true, adminNote: true, updatedAt: true },
    });
  }).catch(() => null);

  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, row: updated });
}
