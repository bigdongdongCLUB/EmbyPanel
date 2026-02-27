export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyDeleteUser } from "@/lib/emby-provision";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, role: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // panel admin accounts are protected and cannot be deleted.
  if (user.role === "ADMIN") {
    return NextResponse.json({ error: "cannot_delete_admin" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const syncDeleteEmby = body?.syncDeleteEmby !== false;

  const embyResults: any[] = [];
  if (syncDeleteEmby) {
    const links = await prisma.embyUserLink.findMany({
      where: { userId: id },
      select: { embyServerId: true, embyUserId: true, embyServer: { select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true } } },
    });

    const settled = await Promise.allSettled(
      links.map(async (l) => {
        const apiKey = getEmbyApiKeyForServer(l.embyServer);
        const r = await embyDeleteUser(l.embyServer.baseUrl, apiKey, l.embyUserId);
        return { embyServerId: l.embyServerId, ok: r.ok, status: r.status, body: (r as any).body };
      }),
    );

    for (const item of settled) {
      if (item.status === "fulfilled") embyResults.push(item.value);
      else embyResults.push({ ok: false, error: item.reason?.message ?? String(item.reason ?? "unknown") });
    }
  }

  // delete panel user (cascades subscriptions+links)
  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true, syncDeleteEmby, embyResults });
}
