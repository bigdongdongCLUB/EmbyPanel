export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { listDocs } from "@/lib/docs-store";

export async function GET() {
  const items = await listDocs();
  return NextResponse.json({ ok: true, items: items.filter((x) => x.published) });
}
