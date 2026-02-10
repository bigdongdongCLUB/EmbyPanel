export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSyncPassword } from "@/lib/user-secrets";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embySetUserPassword } from "@/lib/emby-provision";

const BodySchema = z.object({
  embyServerId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      syncPasswordEnc: true,
      syncPasswordIv: true,
      syncPasswordTag: true,
      embyLinks: { select: { embyServerId: true, embyUserId: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const pw = getSyncPassword(user);
  if (!pw) return NextResponse.json({ error: "missing_sync_password" }, { status: 400 });

  const links = parsed.data.embyServerId
    ? user.embyLinks.filter((x) => x.embyServerId === parsed.data.embyServerId)
    : user.embyLinks;

  if (!links.length) return NextResponse.json({ error: "emby_link_not_found" }, { status: 404 });

  const servers = await prisma.embyServer.findMany({
    where: { id: { in: links.map((x) => x.embyServerId) } },
    select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
  });
  const map = new Map(servers.map((s) => [s.id, s] as const));

  let okCount = 0;
  const failed: Array<{ embyServerId: string; reason: string }> = [];

  for (const l of links) {
    const s = map.get(l.embyServerId);
    if (!s) {
      failed.push({ embyServerId: l.embyServerId, reason: "server_not_found" });
      continue;
    }
    try {
      const apiKey = getEmbyApiKeyForServer(s as any);
      const r = await embySetUserPassword(s.baseUrl, apiKey, l.embyUserId, pw);
      if (r.ok) okCount += 1;
      else failed.push({ embyServerId: l.embyServerId, reason: `http_${r.status}` });
    } catch (e: any) {
      failed.push({ embyServerId: l.embyServerId, reason: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, okCount, failedCount: failed.length, failed });
}
