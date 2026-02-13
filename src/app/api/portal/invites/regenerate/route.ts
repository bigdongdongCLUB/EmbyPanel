export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const CODE_MAP_KEY = "invite_code_map";

function genCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!me) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [row, users] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: CODE_MAP_KEY } }),
    prisma.user.findMany({ select: { username: true } }),
  ]);

  const map = ((row?.valueJson as any) ?? {}) as Record<string, string>;
  const usedCodes = new Set(Object.values(map).map((x) => String(x).toUpperCase()));
  const usernames = new Set(users.map((u) => String(u.username).toUpperCase()));

  let next = "";
  for (let i = 0; i < 20; i++) {
    const c = genCode();
    if (!usedCodes.has(c) && !usernames.has(c)) {
      next = c;
      break;
    }
  }
  if (!next) return NextResponse.json({ error: "generate_failed" }, { status: 500 });

  map[me.id] = next;

  await prisma.appSetting.upsert({
    where: { key: CODE_MAP_KEY },
    create: { key: CODE_MAP_KEY, valueJson: map },
    update: { valueJson: map },
  });

  return NextResponse.json({ ok: true, inviteCode: next });
}
