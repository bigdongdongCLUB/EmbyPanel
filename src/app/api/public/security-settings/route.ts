export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const KEY = "security_basic";

export async function GET() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const raw = (row?.valueJson as any) ?? {};
  return NextResponse.json({
    ok: true,
    data: {
      openRegistration: raw.openRegistration ?? true,
      requireEmailVerification: raw.requireEmailVerification ?? false,
      inviteOnly: raw.inviteOnly ?? false,
      strongPassword: raw.strongPassword ?? false,
    },
  });
}
