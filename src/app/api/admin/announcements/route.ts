export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const KEY = "announcements_list";

const ItemSchema = z.object({
  id: z.string(),
  title: z.string().default(""),
  content: z.string(),
  allVisible: z.boolean().optional().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CreateSchema = z.object({
  title: z.string().max(200).optional().default(""),
  content: z.string().min(1).max(20000),
  allVisible: z.boolean().optional().default(true),
});

const UpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(20000).optional(),
  allVisible: z.boolean().optional(),
});

function nowIso() {
  return new Date().toISOString();
}

function parseList(v: any) {
  if (!Array.isArray(v)) return [] as z.infer<typeof ItemSchema>[];
  const out: z.infer<typeof ItemSchema>[] = [];
  for (const x of v) {
    const p = ItemSchema.safeParse(x);
    if (p.success) out.push(p.data);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function getList() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return parseList(row?.valueJson);
}

async function saveList(list: z.infer<typeof ItemSchema>[]) {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, valueJson: list },
    update: { valueJson: list },
  });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const list = await getList();

  return NextResponse.json({ ok: true, rows: list });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const json = await req.json().catch(() => null);
  const p = CreateSchema.safeParse(json);
  if (!p.success) return NextResponse.json({ error: "invalid_payload", issues: p.error.issues }, { status: 400 });

  const list = await getList();
  const now = nowIso();
  const item = {
    id: crypto.randomUUID(),
    title: p.data.title.trim(),
    content: p.data.content,
    allVisible: p.data.allVisible,
    createdAt: now,
    updatedAt: now,
  };
  list.unshift(item);
  await saveList(list);
  return NextResponse.json({ ok: true, item });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const json = await req.json().catch(() => null);
  const p = UpdateSchema.safeParse(json);
  if (!p.success) return NextResponse.json({ error: "invalid_payload", issues: p.error.issues }, { status: 400 });

  const list = await getList();
  const i = list.findIndex((x) => x.id === p.data.id);
  if (i < 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const prev = list[i];
  list[i] = {
    ...prev,
    ...(p.data.title !== undefined ? { title: p.data.title.trim() } : {}),
    ...(p.data.content !== undefined ? { content: p.data.content } : {}),
    ...(p.data.allVisible !== undefined ? { allVisible: p.data.allVisible } : {}),
    updatedAt: nowIso(),
  };
  await saveList(list);
  return NextResponse.json({ ok: true, item: list[i] });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const list = await getList();
  const next = list.filter((x) => x.id !== id);
  await saveList(next);
  return NextResponse.json({ ok: true });
}
