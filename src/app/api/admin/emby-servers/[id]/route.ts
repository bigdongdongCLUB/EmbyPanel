export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { normalizeBaseUrl } from "@/lib/emby";
import { encryptString } from "@/lib/crypto";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";

const PatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional(),
  externalUrl: z.string().url().nullable().optional(),
  apiKey: z.string().min(10).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const server = await prisma.embyServer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      baseUrl: true,
      externalUrl: true,
      enabled: true,
      apiKey: true,
      apiKeyEnc: true,
      apiKeyIv: true,
      apiKeyTag: true,
    },
  });
  if (!server) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const apiKey = getEmbyApiKeyForServer(server as any);
  return NextResponse.json({
    server: {
      id: server.id,
      name: server.name,
      baseUrl: server.baseUrl,
      externalUrl: server.externalUrl,
      enabled: server.enabled,
      apiKey,
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const data: any = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.baseUrl !== undefined) data.baseUrl = normalizeBaseUrl(parsed.data.baseUrl);
  if (parsed.data.externalUrl !== undefined) data.externalUrl = parsed.data.externalUrl ? normalizeBaseUrl(parsed.data.externalUrl) : null;
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
  if (parsed.data.apiKey !== undefined) {
    const enc = encryptString(parsed.data.apiKey);
    data.apiKeyEnc = enc.enc;
    data.apiKeyIv = enc.iv;
    data.apiKeyTag = enc.tag;
    data.apiKey = null;
  }

  const updated = await prisma.embyServer.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      baseUrl: true,
      externalUrl: true,
      enabled: true,
      lastHealthAt: true,
      lastHealthOk: true,
      lastHealthMsg: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ server: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;

  // Soft constraints: if later we add relations, we should prevent delete when referenced.
  await prisma.embyServer.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
