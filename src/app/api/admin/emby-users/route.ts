export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { embyFetchUsers } from "@/lib/emby";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";

function safeIso(s: string | undefined) {
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const serverId = (url.searchParams.get("serverId") ?? "").trim();

  const servers = await prisma.embyServer.findMany({
    where: serverId ? { id: serverId } : { enabled: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      baseUrl: true,
      apiKey: true,
      apiKeyEnc: true,
      apiKeyIv: true,
      apiKeyTag: true,
      enabled: true,
    },
  });

  const results: any[] = [];
  const errors: any[] = [];

  for (const s of servers) {
    const apiKey = getEmbyApiKeyForServer(s);
    const usersRes = await embyFetchUsers(s.baseUrl, apiKey);
    if (!usersRes.ok) {
      errors.push({ serverId: s.id, name: s.name, status: usersRes.status, body: usersRes.body?.slice(0, 200) });
      continue;
    }

    for (const u of usersRes.users) {
      const name = u.Name ?? "";
      if (q && !name.toLowerCase().includes(q)) continue;
      results.push({
        serverId: s.id,
        serverName: s.name,
        username: name,
        embyUserId: u.Id,
        status: u.Policy?.IsDisabled ? "禁用" : "启用",
        isAdmin: !!u.Policy?.IsAdministrator,
        lastLoginDate: safeIso(u.LastLoginDate),
        lastActivityDate: safeIso(u.LastActivityDate),
      });
    }
  }

  results.sort((a, b) => {
    const s = (a.serverName || "").localeCompare(b.serverName || "");
    if (s !== 0) return s;
    return (a.username || "").localeCompare(b.username || "");
  });

  return NextResponse.json({ ok: true, users: results, errors });
}
