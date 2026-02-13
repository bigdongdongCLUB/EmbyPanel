export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

const KEY = "site_basic";

const Schema = z.object({
  siteName: z.string().min(1).max(100),
  siteDescription: z.string().max(300).default(""),
  siteLogoDataUrl: z.string().max(3_000_000).nullable().optional(),
});

const DEFAULTS = {
  siteName: "EmbyPanel",
  siteDescription: "See the BestEmby",
  siteLogoDataUrl: null as string | null,
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const value = (row?.valueJson as any) ?? {};

  return NextResponse.json({
    ok: true,
    data: {
      siteName: value.siteName || DEFAULTS.siteName,
      siteDescription: value.siteDescription || DEFAULTS.siteDescription,
      siteLogoDataUrl: value.siteLogoDataUrl ?? DEFAULTS.siteLogoDataUrl,
    },
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const p = parsed.data;
  if (p.siteLogoDataUrl && !/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(p.siteLogoDataUrl)) {
    return NextResponse.json({ error: "invalid_logo_format" }, { status: 400 });
  }

  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, valueJson: { siteName: p.siteName, siteDescription: p.siteDescription, siteLogoDataUrl: p.siteLogoDataUrl ?? null } },
    update: { valueJson: { siteName: p.siteName, siteDescription: p.siteDescription, siteLogoDataUrl: p.siteLogoDataUrl ?? null } },
  });

  return NextResponse.json({ ok: true });
}
