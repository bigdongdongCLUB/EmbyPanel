export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { runAdminCsvImport } from "@/lib/admin-csv-import";

const Schema = z.object({
  csv: z.string().min(1),
  fallbackPlanId: z.string().min(1).nullable().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  try {
    const result = await runAdminCsvImport({
      csv: parsed.data.csv,
      fallbackPlanId: parsed.data.fallbackPlanId ?? null,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg === "empty_csv") return NextResponse.json({ error: "empty_csv" }, { status: 400 });
    if (msg.startsWith("too_many_rows:")) {
      return NextResponse.json({ error: "too_many_rows", max: Number(msg.split(":")[1] || 1000) }, { status: 400 });
    }
    return NextResponse.json({ error: "import_failed", detail: msg }, { status: 500 });
  }
}
