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

  const embyUsers = usersRes.users
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

  const links = await prisma.embyUserLink.findMany({
    where: { embyServerId: server.id },
    select: {
      embyUserId: true,
      disabled: true,
      user: { select: { id: true, username: true, email: true } },
    },
  });

  const linkByEmbyUserId = new Map(links.map((l) => [l.embyUserId, l] as const));

  const users = embyUsers.map((u) => {
    const link = linkByEmbyUserId.get(u.id);
    if (!link) {
      return {
        ...u,
        panel: null,
        anomalyStatus: "仅Emby",
      };
    }

    return {
      ...u,
      panel: {
        id: link.user.id,
        username: link.user.username,
        email: link.user.email,
        linkDisabled: link.disabled,
      },
      anomalyStatus: null,
    };
  });

  return NextResponse.json({ ok: true, server: { id: server.id, name: server.name }, users });
}
