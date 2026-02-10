export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

const KEY = "site_basic";

export async function GET() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const value = (row?.valueJson as any) ?? {};

  return NextResponse.json({
    ok: true,
    data: {
      siteName: value.siteName || "BestEmby",
      siteDescription: value.siteDescription || "See the BestEmby",
      siteLogoDataUrl: value.siteLogoDataUrl ?? null,
    },
  });
}
