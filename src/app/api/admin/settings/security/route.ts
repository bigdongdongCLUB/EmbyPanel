export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const KEY = "security_basic";

const Schema = z.object({
  openRegistration: z.boolean().default(true),
  requireEmailVerification: z.boolean().default(false),
  inviteOnly: z.boolean().default(false),
  reservedUsernames: z.string().max(4000).default(""),
  strongPassword: z.boolean().default(false),
});

const DEFAULTS = {
  openRegistration: true,
  requireEmailVerification: false,
  inviteOnly: false,
  reservedUsernames:
    "root,system,service,template,guest,test,demo,support,help,api,public,private,static,assets,cdn,www,mail,ftp,ssh,backup,update,user,users,emby,jellyfin,plex,media,server,admin",
  strongPassword: false,
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const raw = (row?.valueJson as any) ?? {};

  return NextResponse.json({
    ok: true,
    data: {
      openRegistration: raw.openRegistration ?? DEFAULTS.openRegistration,
      requireEmailVerification: raw.requireEmailVerification ?? DEFAULTS.requireEmailVerification,
      inviteOnly: raw.inviteOnly ?? DEFAULTS.inviteOnly,
      reservedUsernames: raw.reservedUsernames ?? DEFAULTS.reservedUsernames,
      strongPassword: raw.strongPassword ?? DEFAULTS.strongPassword,
    },
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, valueJson: parsed.data },
    update: { valueJson: parsed.data },
  });

  return NextResponse.json({ ok: true });
}
