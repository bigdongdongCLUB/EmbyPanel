export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyDeleteUser, embySetUserDisabled } from "@/lib/emby-provision";

const Schema = z.object({
  action: z.enum(["disable", "enable", "delete"]),
  userIds: z.array(z.string().min(1)).min(1),
});

async function isAdminUser(serverBaseUrl: string, apiKey: string, embyUserId: string) {
  const u = await fetch(`${serverBaseUrl.replace(/\/+$/, "")}/Users/${encodeURIComponent(embyUserId)}?api_key=${encodeURIComponent(apiKey)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!u.ok) return false;
  const uj = await u.json().catch(() => null);
  return !!uj?.Policy?.IsAdministrator;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: serverId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const server = await prisma.embyServer.findUnique({ where: { id: serverId } });
  if (!server) return NextResponse.json({ error: "server_not_found" }, { status: 404 });

  const apiKey = getEmbyApiKeyForServer(server);
  if (!apiKey) return NextResponse.json({ error: "missing_emby_api_key" }, { status: 400 });

  const uniqueUserIds = Array.from(new Set(parsed.data.userIds));
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  await Promise.all(
    uniqueUserIds.map(async (embyUserId) => {
      try {
        if (await isAdminUser(server.baseUrl, apiKey, embyUserId)) {
          results.push({ id: embyUserId, ok: false, error: "admin_user_forbidden" });
          return;
        }

        if (parsed.data.action === "delete") {
          const r = await embyDeleteUser(server.baseUrl, apiKey, embyUserId);
          if (!r.ok) {
            results.push({ id: embyUserId, ok: false, error: "emby_failed" });
            return;
          }

          const linked = await prisma.embyUserLink.findFirst({ where: { embyServerId: server.id, embyUserId }, select: { userId: true } });
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
                await prisma.subscription.update({ where: { id: activeSub.id }, data: { status: "CANCELED", planId: null } });
              }
            }
          }

          await prisma.embyUserLink.deleteMany({ where: { embyServerId: server.id, embyUserId } });
          results.push({ id: embyUserId, ok: true });
          return;
        }

        const disabled = parsed.data.action === "disable";
        const r = await embySetUserDisabled(server.baseUrl, apiKey, embyUserId, disabled);
        if (!r.ok) {
          results.push({ id: embyUserId, ok: false, error: "emby_failed" });
          return;
        }
        await prisma.embyUserLink.updateMany({ where: { embyServerId: server.id, embyUserId }, data: { disabled } });
        results.push({ id: embyUserId, ok: true });
      } catch (e: any) {
        results.push({ id: embyUserId, ok: false, error: e?.message ?? String(e) });
      }
    }),
  );

  return NextResponse.json({ ok: true, results });
}
