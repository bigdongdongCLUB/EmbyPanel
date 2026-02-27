export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { getCsvImportJob } from "@/lib/csv-import-jobs";

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { jobId } = await ctx.params;
  const job = getCsvImportJob(jobId);
  if (!job) return NextResponse.json({ error: "job_not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, job });
}
