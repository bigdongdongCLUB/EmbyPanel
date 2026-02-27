export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyDeleteUser } from "@/lib/emby-provision";

const Schema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  syncDeleteEmby: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const syncDeleteEmby = parsed.data.syncDeleteEmby === true;
  const results: Array<{ id: string; ok: boolean; status?: number; error?: string }> = [];

  for (const id of parsed.data.ids) {
    try {
      const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
      if (!user) {
        results.push({ id, ok: false, status: 404, error: "not_found" });
        continue;
      }
      if (user.role === "ADMIN") {
        results.push({ id, ok: false, status: 400, error: "cannot_delete_admin" });
        continue;
      }

      if (syncDeleteEmby) {
        const links = await prisma.embyUserLink.findMany({
          where: { userId: id },
          select: {
            embyUserId: true,
            embyServer: { select: { baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true } },
          },
        });

        await Promise.allSettled(
          links.map(async (l) => {
            const apiKey = getEmbyApiKeyForServer(l.embyServer);
            await embyDeleteUser(l.embyServer.baseUrl, apiKey, l.embyUserId);
          }),
        );
      }

      await prisma.user.delete({ where: { id } });
      results.push({ id, ok: true, status: 200 });
    } catch (e: any) {
      results.push({ id, ok: false, error: e?.message ?? String(e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
