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

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const deleted = await prisma.vodRequest.delete({
    where: { id },
    select: { id: true },
  }).catch(() => null);

  if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
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

  const data: any = {};
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.bizStatus) data.bizStatus = parsed.data.bizStatus;
  if (parsed.data.adminNote !== undefined) data.adminNote = parsed.data.adminNote || null;

  const updated = await prisma.vodRequest.update({
    where: { id },
    data,
    select: { id: true, status: true, bizStatus: true, adminNote: true, updatedAt: true },
  }).catch(() => null);

  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, row: updated });
}
