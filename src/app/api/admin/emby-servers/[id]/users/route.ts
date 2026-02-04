export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { embyFetchUsers } from "@/lib/emby";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const server = await prisma.embyServer.findUnique({ where: { id } });
  if (!server) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const apiKey = getEmbyApiKeyForServer(server);
  const usersRes = await embyFetchUsers(server.baseUrl, apiKey);
  if (!usersRes.ok) {
    return NextResponse.json(
      { error: "emby_unreachable", detail: { status: usersRes.status, body: usersRes.body?.slice(0, 300) } },
      { status: 502 }
    );
  }

  const users = usersRes.users
    .map((u) => ({
      id: u.Id,
      name: u.Name,
      policy: {
        isDisabled: !!u.Policy?.IsDisabled,
        isAdministrator: !!u.Policy?.IsAdministrator,
      },
      lastLoginDate: u.LastLoginDate ?? null,
      lastActivityDate: u.LastActivityDate ?? null,
    }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return NextResponse.json({ ok: true, server: { id: server.id, name: server.name }, users });
}
