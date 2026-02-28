export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { embyFetchSystemInfo } from "@/lib/emby";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  let server: any = null;
  try {
    server = await prisma.embyServer.findUnique({ where: { id }, select: { id: true, baseUrl: true, externalUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true } });
  } catch {
    server = await prisma.embyServer.findUnique({ where: { id }, select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true } });
  }
  if (!server) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const apiKey = getEmbyApiKeyForServer(server);

  const started = Date.now();
  const baseRes = await embyFetchSystemInfo(server.baseUrl, apiKey);
  const baseMs = Date.now() - started;

  let external: any = { tested: false };
  if ((server as any).externalUrl) {
    const t1 = Date.now();
    const extRes = await embyFetchSystemInfo((server as any).externalUrl, apiKey);
    const extMs = Date.now() - t1;
    external = extRes.ok
      ? { tested: true, ok: true, ms: extMs }
      : { tested: true, ok: false, error: `HTTP ${extRes.status}: ${extRes.body?.slice(0, 300)}` };
  }

  const detail = baseRes.ok
    ? { base: { ok: true, ms: baseMs }, external }
    : { base: { ok: false, error: `HTTP ${baseRes.status}: ${baseRes.body?.slice(0, 300)}` }, external };

  await prisma.embyServer.update({
    where: { id },
    data: {
      lastHealthAt: new Date(),
      lastHealthOk: baseRes.ok,
      lastHealthMsg: JSON.stringify(detail),
    },
  });

  if (!baseRes.ok) {
    return NextResponse.json({ ok: false, base: detail.base, external }, { status: 502 });
  }

  const info = baseRes.parsed.success ? baseRes.parsed.data : baseRes.json;
  return NextResponse.json({ ok: true, ms: baseMs, info, base: detail.base, external });
}
