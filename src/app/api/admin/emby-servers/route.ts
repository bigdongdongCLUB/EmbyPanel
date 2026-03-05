export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { normalizeBaseUrl } from "@/lib/emby";
import { encryptString } from "@/lib/crypto";

async function ensureServerExtraColumns() {
  await prisma.$executeRawUnsafe('ALTER TABLE "EmbyServer" ADD COLUMN IF NOT EXISTS "externalUrl" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE "EmbyServer" ADD COLUMN IF NOT EXISTS "backupUrl" TEXT');
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await ensureServerExtraColumns();

  let servers: any[] = [];
  try {
    servers = await prisma.embyServer.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        externalUrl: true,
        backupUrl: true,
        enabled: true,
        lastHealthAt: true,
        lastHealthOk: true,
        lastHealthMsg: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch {
    // 兼容尚未执行 externalUrl 迁移的环境
    servers = await prisma.embyServer.findMany({
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
  }

  return NextResponse.json({ servers });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  externalUrl: z.string().url().optional().nullable(),
  backupUrl: z.string().url().optional().nullable(),
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
  await ensureServerExtraColumns();

  const server = await prisma.embyServer.create({
    data: {
      name: parsed.data.name,
      baseUrl: normalizeBaseUrl(parsed.data.baseUrl),
      externalUrl: parsed.data.externalUrl ? normalizeBaseUrl(parsed.data.externalUrl) : null,
      backupUrl: parsed.data.backupUrl ? normalizeBaseUrl(parsed.data.backupUrl) : null,
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
      externalUrl: true,
      backupUrl: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ server }, { status: 201 });
}
