export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embySetUserDisabled } from "@/lib/emby-provision";

export async function POST(req: Request) {
  const internalSecret = (process.env.INTERNAL_JOBS_SECRET ?? "").trim();
  const headerInternalSecret = (req.headers.get("x-internal-jobs-secret") ?? "").trim();

  if (internalSecret && headerInternalSecret) {
    if (internalSecret !== headerInternalSecret) return NextResponse.json({ error: "invalid_internal_jobs_secret" }, { status: 401 });
  } else {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const now = new Date();

  const users = await prisma.user.findMany({
    where: {
      subscriptions: {
        some: {
          status: "ACTIVE",
          endAt: { lte: now },
        },
      },
      embyLinks: {
        some: { disabled: false },
      },
    },
    select: {
      id: true,
      username: true,
      embyLinks: {
        where: { disabled: false },
        select: {
          id: true,
          embyUserId: true,
          embyServerId: true,
          embyServer: { select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true } },
        },
      },
    },
  });

  let usersScanned = 0;
  let linksDisabled = 0;
  let apiWarnings = 0;

  for (const u of users) {
    usersScanned += 1;
    for (const l of u.embyLinks) {
      try {
        const apiKey = getEmbyApiKeyForServer(l.embyServer as any);
        const r = await embySetUserDisabled(l.embyServer.baseUrl, apiKey, l.embyUserId, true);
        if (!r?.ok) apiWarnings += 1;
      } catch {
        apiWarnings += 1;
      }

      await prisma.embyUserLink.updateMany({
        where: { id: l.id },
        data: { disabled: true },
      });
      linksDisabled += 1;
    }
  }

  return NextResponse.json({ ok: true, usersScanned, linksDisabled, apiWarnings });
}
