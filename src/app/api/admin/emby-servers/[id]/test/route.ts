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
  let result = await embyFetchSystemInfo(server.baseUrl, apiKey);
  let usedUrl = server.baseUrl;
  if (!result.ok && (server as any).externalUrl && (server as any).externalUrl !== server.baseUrl) {
    result = await embyFetchSystemInfo((server as any).externalUrl, apiKey);
    usedUrl = (server as any).externalUrl;
  }
  const ms = Date.now() - started;

  if (!result.ok) {
    await prisma.embyServer.update({
      where: { id },
      data: {
        lastHealthAt: new Date(),
        lastHealthOk: false,
        lastHealthMsg: `HTTP ${result.status}: ${result.body?.slice(0, 300)}`,
      },
    });
    return NextResponse.json({ ok: false, ms, status: result.status }, { status: 502 });
  }

  const info = result.parsed.success ? result.parsed.data : result.json;

  await prisma.embyServer.update({
    where: { id },
    data: {
      lastHealthAt: new Date(),
      lastHealthOk: true,
      lastHealthMsg: `OK ${ms}ms`,
    },
  });

  return NextResponse.json({ ok: true, ms, info, usedUrl });
}
