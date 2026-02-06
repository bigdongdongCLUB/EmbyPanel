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

  const r = await embyDeleteUser(server.baseUrl, apiKey, embyUserId);
  if (!r.ok) return NextResponse.json({ error: "emby_failed", detail: r }, { status: 502 });

  // Clean up link rows to avoid orphaned links.
  await prisma.embyUserLink.deleteMany({ where: { embyServerId: server.id, embyUserId } });

  return NextResponse.json({ ok: true });
}
