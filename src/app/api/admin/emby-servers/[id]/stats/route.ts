export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { embyFetchSystemInfo, embyFetchUsers } from "@/lib/emby";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const server = await prisma.embyServer.findUnique({ where: { id } });
  if (!server) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const apiKey = getEmbyApiKeyForServer(server);

  const [infoRes, usersRes] = await Promise.all([
    embyFetchSystemInfo(server.baseUrl, apiKey),
    embyFetchUsers(server.baseUrl, apiKey),
  ]);

  if (!infoRes.ok) {
    return NextResponse.json(
      { error: "emby_unreachable", detail: { status: infoRes.status, body: infoRes.body?.slice(0, 300) } },
      { status: 502 }
    );
  }

  if (!usersRes.ok) {
    return NextResponse.json(
      { error: "emby_unreachable", detail: { status: usersRes.status, body: usersRes.body?.slice(0, 300) } },
      { status: 502 }
    );
  }

  const users = usersRes.users;
  const total = users.length;
  const enabled = users.filter((u) => !u.Policy?.IsDisabled).length;
  const disabled = total - enabled;
  const enabledPct = total ? Math.round((enabled / total) * 1000) / 10 : 0;

  const info = infoRes.parsed.success ? infoRes.parsed.data : infoRes.json;

  return NextResponse.json({
    ok: true,
    server: { id: server.id, name: server.name, baseUrl: server.baseUrl },
    emby: {
      serverName: info?.ServerName ?? null,
      version: info?.Version ?? null,
    },
    users: {
      total,
      enabled,
      disabled,
      enabledPct,
    },
  });
}
