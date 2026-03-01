export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { listDocs, saveDocs } from "@/lib/docs-store";

const SaveSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  content: z.string().default(""),
  published: z.boolean().default(false),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const items = await listDocs();
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const now = new Date().toISOString();
  const items = await listDocs();
  const id = parsed.data.id || crypto.randomUUID();
  const idx = items.findIndex((x) => x.id === id);
  const next = {
    id,
    title: parsed.data.title.trim(),
    content: parsed.data.content,
    published: parsed.data.published,
    createdAt: idx >= 0 ? items[idx].createdAt : now,
    updatedAt: now,
  };

  if (idx >= 0) items[idx] = next;
  else items.unshift(next);

  await saveDocs(items);
  return NextResponse.json({ ok: true, item: next });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = String(new URL(req.url).searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const items = await listDocs();
  const next = items.filter((x) => x.id !== id);
  await saveDocs(next);
  return NextResponse.json({ ok: true });
}
