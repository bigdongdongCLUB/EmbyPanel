export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const row = await prisma.appSetting.findUnique({ where: { key: "vod_settings" } });
  const enabled = Boolean((row?.valueJson as any)?.enabled ?? false);
  return NextResponse.json({ ok: true, enabled });
}
