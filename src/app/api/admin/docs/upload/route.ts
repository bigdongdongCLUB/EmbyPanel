export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import fs from "node:fs/promises";
import path from "node:path";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "missing_file" }, { status: 400 });

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return NextResponse.json({ error: 'invalid_file_type' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'file_too_large' }, { status: 400 });

  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const dir = path.join(process.cwd(), 'public', 'uploads', 'docs', y, m);

  try {
    await fs.mkdir(dir, { recursive: true });

    const name = `${crypto.randomUUID()}.${ext}`;
    const abs = path.join(dir, name);
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(abs, buf);

    const url = `/uploads/docs/${y}/${m}/${name}`;
    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    return NextResponse.json({ error: 'upload_write_failed', detail: e?.message || String(e) }, { status: 500 });
  }
}
