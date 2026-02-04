export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyDeleteUser } from "@/lib/emby-provision";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, role: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // prevent self-lockout: keep at least one admin
  if (user.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "cannot_delete_last_admin" }, { status: 400 });
    }
  }

  const links = await prisma.embyUserLink.findMany({
    where: { userId: id },
    select: { embyServerId: true, embyUserId: true, embyServer: { select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true } } },
  });

  const embyResults: any[] = [];
  for (const l of links) {
    const apiKey = getEmbyApiKeyForServer(l.embyServer);
    const r = await embyDeleteUser(l.embyServer.baseUrl, apiKey, l.embyUserId);
    embyResults.push({ embyServerId: l.embyServerId, ok: r.ok, status: r.status, body: (r as any).body });
  }

  // delete panel user (cascades subscriptions+links)
  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true, embyResults });
}
