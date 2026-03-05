export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getLoginRiskStatus } from "@/lib/login-risk";

const BODY_SCHEMA = z.object({
  username: z.string().min(1).max(64),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = BODY_SCHEMA.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const status = await getLoginRiskStatus(parsed.data.username);
  return NextResponse.json({ ok: true, ...status });
}
