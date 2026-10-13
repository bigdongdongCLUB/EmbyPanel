export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { lockVodPointUser, settleVodPoints } from "@/lib/vod-points";

const PatchSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  bizStatus: z.enum(["PENDING", "NO_RESOURCE", "PROCESSING", "CANNOT_UPDATE", "COMPLETED"]).optional(),
  adminNote: z.string().max(40).optional(),
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
  const deleted = await prisma.$transaction(async (tx) => {
    const row = await tx.vodRequest.findUnique({ where: { id }, select: { userId: true } });
    if (!row) return null;
    await lockVodPointUser(tx, row.userId);
    await tx.vodPointEntry.updateMany({ where: { requestId: id, state: "RESERVED" }, data: { state: "RELEASED" } });
    return tx.vodRequest.delete({ where: { id }, select: { id: true } });
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
      status: true,
      bizStatus: true,
    },
  });
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const hasStatusChange = parsed.data.status !== undefined || parsed.data.bizStatus !== undefined;

  let pointError = false;
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
            userId: true,
            mediaType: true,
            tmdbId: true,
            title: true,
            titleOriginal: true,
            year: true,
            season: true,
            createdAt: true,
            status: true,
            bizStatus: true,
          },
        })
      : await tx.vodRequest.findMany({
          where: { mediaType: current.mediaType, year: current.year, season: current.season },
          select: {
            id: true,
            userId: true,
            mediaType: true,
            tmdbId: true,
            title: true,
            titleOriginal: true,
            year: true,
            season: true,
            createdAt: true,
            status: true,
            bizStatus: true,
          },
        });

    const groupedCandidates = candidates.filter((row) => mediaGroupKey(row) === currentKey);
    for (const userId of [...new Set(groupedCandidates.map((row) => row.userId))].sort()) {
      await lockVodPointUser(tx, userId);
    }
    // Re-read status after the user locks so completed peers cannot be refunded by a concurrent update.
    const lockedRows = await tx.vodRequest.findMany({
      where: { id: { in: groupedCandidates.map((row) => row.id) } },
      select: { id: true, status: true, bizStatus: true },
    });
    const lockedById = new Map(lockedRows.map((row) => [row.id, row]));
    const sameGroup = groupedCandidates.filter((row) => lockedById.has(row.id)).map((row) => ({ ...row, ...lockedById.get(row.id)! }));
    const selectedRow = sameGroup.find((row) => row.id === id);
    if (!selectedRow) return null;

    const latest = sameGroup
      .slice()
      .sort((a, b) => {
        const dt = b.createdAt.getTime() - a.createdAt.getTime();
        if (dt !== 0) return dt;
        return b.id.localeCompare(a.id);
      })[0];

    const targetBizStatus = parsed.data.bizStatus ?? (
      parsed.data.status === "APPROVED" ? "COMPLETED" :
      parsed.data.status === "REJECTED" ? "NO_RESOURCE" :
      parsed.data.status === "CANCELLED" ? "PROCESSING" : "PENDING"
    );
    const targetStatus = targetBizStatus === "COMPLETED" ? "APPROVED" :
      targetBizStatus === "PENDING" || targetBizStatus === "PROCESSING" ? "PENDING" : "REJECTED";
    const statusData = { status: targetStatus, bizStatus: targetBizStatus } as const;
    const affectedRows = latest && latest.id === id
      ? sameGroup.filter((row) => row.id === id || row.bizStatus !== "COMPLETED")
      : [selectedRow];
    const changedIds = affectedRows
      .filter((row) => row.bizStatus !== targetBizStatus || row.status !== targetStatus)
      .map((row) => row.id);
    await settleVodPoints(tx, changedIds, targetBizStatus === "COMPLETED", ["PENDING", "PROCESSING"].includes(targetBizStatus), new Date(), targetBizStatus);

    if (latest && latest.id === id && Object.keys(statusData).length > 0) {
      await tx.vodRequest.updateMany({
        where: { id: { in: affectedRows.map((row) => row.id) } },
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
  }, { timeout: 15000 }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "vod_points_insufficient") {
      pointError = true;
      return null;
    }
    throw error;
  });

  if (pointError) return NextResponse.json({ error: "vod_points_insufficient", message: "该内容的点播用户本月积分不足，状态未更改" }, { status: 409 });

  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, row: updated });
}
