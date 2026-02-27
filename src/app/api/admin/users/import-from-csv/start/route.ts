export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { startCsvImportJob } from "@/lib/csv-import-jobs";

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

  const jobId = startCsvImportJob({
    csv: parsed.data.csv,
    fallbackPlanId: parsed.data.fallbackPlanId ?? null,
  });

  return NextResponse.json({ ok: true, jobId });
}
