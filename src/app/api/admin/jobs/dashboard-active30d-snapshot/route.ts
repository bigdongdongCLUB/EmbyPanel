export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { refreshActive30dSnapshot } from "@/app/admin/dashboard-stats";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  const internalSecret = (process.env.INTERNAL_JOBS_SECRET ?? "").trim();
  const headerInternalSecret = (req.headers.get("x-internal-jobs-secret") ?? "").trim();

  if (internalSecret) {
    if (internalSecret !== headerInternalSecret) {
      if (!auth.ok) return NextResponse.json({ error: "invalid_internal_jobs_secret" }, { status: 401 });
    }
  } else if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const snap = await refreshActive30dSnapshot();
    return NextResponse.json({
      ok: true,
      embyActive30dTotal: snap.embyActive30dTotal,
      serverCount: snap.perServer.length,
      snapshotAt: snap.snapshotAt,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "snapshot_failed", message: String(e?.message ?? e) }, { status: 500 });
  }
}
