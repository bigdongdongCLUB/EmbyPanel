export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { pickServerForPlan } from "@/lib/plan-assign";

export async function POST(_req: Request, { params }: any) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const picked = await pickServerForPlan(params.id);
    return NextResponse.json({ ok: true, picked });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}
