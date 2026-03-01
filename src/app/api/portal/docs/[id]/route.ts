export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { listDocs } from "@/lib/docs-store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const items = await listDocs();
  const item = items.find((x) => x.id === id && x.published);
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}
