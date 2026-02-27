export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyDeleteUser, embySetUserDisabled } from "@/lib/emby-provision";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: serverId, userId: embyUserId } = await ctx.params;

  const json = await req.json().catch(() => null);
  const disabled = json?.disabled;
  if (typeof disabled !== "boolean") return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const server = await prisma.embyServer.findUnique({ where: { id: serverId } });
  if (!server) return NextResponse.json({ error: "server_not_found" }, { status: 404 });

  const apiKey = getEmbyApiKeyForServer(server);
  if (!apiKey) return NextResponse.json({ error: "missing_emby_api_key" }, { status: 400 });

  // Block admin user operations
  // (UI blocks too, but keep server-side guard.)
  const u = await fetch(`${server.baseUrl.replace(/\/+$/, "")}/Users/${encodeURIComponent(embyUserId)}?api_key=${encodeURIComponent(apiKey)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (u.ok) {
    const uj = await u.json().catch(() => null);
    const isAdmin = !!uj?.Policy?.IsAdministrator;
    if (isAdmin) return NextResponse.json({ error: "admin_user_forbidden" }, { status: 403 });
  }

  const r = await embySetUserDisabled(server.baseUrl, apiKey, embyUserId, disabled);
  if (!r.ok) return NextResponse.json({ error: "emby_failed", detail: r }, { status: 502 });

  // Best-effort: update link disabled flag if this emby user is linked to a panel user.
  await prisma.embyUserLink.updateMany({
    where: { embyServerId: server.id, embyUserId },
    data: { disabled },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: serverId, userId: embyUserId } = await ctx.params;

  const server = await prisma.embyServer.findUnique({ where: { id: serverId } });
  if (!server) return NextResponse.json({ error: "server_not_found" }, { status: 404 });

  const apiKey = getEmbyApiKeyForServer(server);
  if (!apiKey) return NextResponse.json({ error: "missing_emby_api_key" }, { status: 400 });

  // Block admin user operations
  const u = await fetch(`${server.baseUrl.replace(/\/+$/, "")}/Users/${encodeURIComponent(embyUserId)}?api_key=${encodeURIComponent(apiKey)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (u.ok) {
    const uj = await u.json().catch(() => null);
    const isAdmin = !!uj?.Policy?.IsAdministrator;
    if (isAdmin) return NextResponse.json({ error: "admin_user_forbidden" }, { status: 403 });
  }

  const r = await embyDeleteUser(server.baseUrl, apiKey, embyUserId);
  if (!r.ok) return NextResponse.json({ error: "emby_failed", detail: r }, { status: 502 });

  // 若该 Emby 用户已关联面板用户：仅解除该服务器分配，不删除面板用户。
  const linked = await prisma.embyUserLink.findFirst({
    where: { embyServerId: server.id, embyUserId },
    select: { userId: true },
  });

  if (linked?.userId) {
    const activeSub = await prisma.subscription.findFirst({
      where: { userId: linked.userId, status: "ACTIVE" },
      orderBy: { endAt: "desc" },
      select: { id: true },
    });

    if (activeSub) {
      await prisma.subscriptionServer.deleteMany({ where: { subscriptionId: activeSub.id, embyServerId: server.id } });
      const remain = await prisma.subscriptionServer.count({ where: { subscriptionId: activeSub.id } });
      if (remain === 0) {
        await prisma.subscription.update({
          where: { id: activeSub.id },
          data: { status: "CANCELED", planId: null },
        });
      }
    }
  }

  // 清理 link，避免悬挂关系。
  await prisma.embyUserLink.deleteMany({ where: { embyServerId: server.id, embyUserId } });

  return NextResponse.json({ ok: true });
}
