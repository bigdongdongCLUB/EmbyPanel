export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { normalizeBaseUrl } from "@/lib/emby";
import { encryptString } from "@/lib/crypto";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const servers = await prisma.embyServer.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      baseUrl: true,
      enabled: true,
      lastHealthAt: true,
      lastHealthOk: true,
      lastHealthMsg: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ servers });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  apiKey: z.string().min(10),
  enabled: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const enc = encryptString(parsed.data.apiKey);

  const server = await prisma.embyServer.create({
    data: {
      name: parsed.data.name,
      baseUrl: normalizeBaseUrl(parsed.data.baseUrl),
      apiKeyEnc: enc.enc,
      apiKeyIv: enc.iv,
      apiKeyTag: enc.tag,
      // keep plaintext empty
      apiKey: null,
      enabled: parsed.data.enabled ?? true,
    },
    select: {
      id: true,
      name: true,
      baseUrl: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ server }, { status: 201 });
}
