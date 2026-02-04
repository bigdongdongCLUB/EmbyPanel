export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";

const Schema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const results: Array<{ id: string; ok: boolean; status?: number; error?: string }> = [];

  for (const id of parsed.data.ids) {
    try {
      const res = await fetch(new URL(`/api/admin/users/${id}/delete`, req.url).toString(), { method: "POST" });
      const txt = await res.text();
      if (!res.ok) {
        results.push({ id, ok: false, status: res.status, error: txt });
      } else {
        results.push({ id, ok: true, status: res.status });
      }
    } catch (e: any) {
      results.push({ id, ok: false, error: e?.message ?? String(e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
