export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

const CODE_MAP_KEY = "invite_code_map";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("code") || "").trim();
  if (!raw) return NextResponse.json({ ok: true, valid: false });

  const codeUpper = raw.toUpperCase();
  const codeRow = await prisma.appSetting.findUnique({ where: { key: CODE_MAP_KEY } });
  const codeMap = ((codeRow?.valueJson as any) ?? {}) as Record<string, string>;

  const matchedUserId = Object.entries(codeMap).find(([, code]) => String(code || "").toUpperCase() === codeUpper)?.[0] ?? null;
  if (matchedUserId) {
    return NextResponse.json({ ok: true, valid: true, source: "invite_code_map" });
  }

  const inviter = await prisma.user.findFirst({
    where: { username: { equals: raw, mode: "insensitive" } },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, valid: !!inviter, source: inviter ? "username" : "none" });
}
