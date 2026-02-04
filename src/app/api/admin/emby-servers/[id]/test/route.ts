export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { embyFetchSystemInfo } from "@/lib/emby";
import { decryptString } from "@/lib/crypto";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const server = await prisma.embyServer.findUnique({ where: { id } });
  if (!server) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const apiKey = server.apiKeyEnc && server.apiKeyIv && server.apiKeyTag
    ? decryptString({ enc: server.apiKeyEnc, iv: server.apiKeyIv, tag: server.apiKeyTag })
    : (server.apiKey ?? "");

  const started = Date.now();
  const result = await embyFetchSystemInfo(server.baseUrl, apiKey);
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

  return NextResponse.json({ ok: true, ms, info });
}
