export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { decryptString, encryptString } from "@/lib/crypto";

const KEY = "mail_basic";

const Schema = z.object({
  enabled: z.boolean().default(false),
  smtpHost: z.string().min(1).max(200),
  secureMode: z.enum(["ssl", "starttls", "none"]).default("ssl"),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpUser: z.string().max(200).default(""),
  smtpPassword: z.string().max(500).optional(),
  fromEmail: z.string().email(),
  fromName: z.string().max(200).default(""),
});

const DEFAULTS = {
  enabled: false,
  smtpHost: "",
  secureMode: "ssl" as const,
  smtpPort: 465,
  smtpUser: "",
  fromEmail: "",
  fromName: "",
};

function decodePassword(value: any): string {
  try {
    if (value?.smtpPasswordEnc && value?.smtpPasswordIv && value?.smtpPasswordTag) {
      return decryptString({ enc: value.smtpPasswordEnc, iv: value.smtpPasswordIv, tag: value.smtpPasswordTag });
    }
  } catch {}
  return "";
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const value = (row?.valueJson as any) ?? {};

  return NextResponse.json({
    ok: true,
    data: {
      enabled: !!value.enabled,
      smtpHost: value.smtpHost || DEFAULTS.smtpHost,
      secureMode: value.secureMode || DEFAULTS.secureMode,
      smtpPort: Number(value.smtpPort || DEFAULTS.smtpPort),
      smtpUser: value.smtpUser || DEFAULTS.smtpUser,
      // never return plain password
      smtpPasswordSet: !!decodePassword(value),
      fromEmail: value.fromEmail || DEFAULTS.fromEmail,
      fromName: value.fromName || DEFAULTS.fromName,
    },
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const current = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const currentValue = (current?.valueJson as any) ?? {};
  const currentPassword = decodePassword(currentValue);

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const p = parsed.data;
  const password = p.smtpPassword && p.smtpPassword.length ? p.smtpPassword : currentPassword;

  const enc = password ? encryptString(password) : null;

  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: {
      key: KEY,
      valueJson: {
        enabled: p.enabled,
        smtpHost: p.smtpHost,
        secureMode: p.secureMode,
        smtpPort: p.smtpPort,
        smtpUser: p.smtpUser,
        smtpPasswordEnc: enc?.enc ?? null,
        smtpPasswordIv: enc?.iv ?? null,
        smtpPasswordTag: enc?.tag ?? null,
        fromEmail: p.fromEmail,
        fromName: p.fromName,
      },
    },
    update: {
      valueJson: {
        enabled: p.enabled,
        smtpHost: p.smtpHost,
        secureMode: p.secureMode,
        smtpPort: p.smtpPort,
        smtpUser: p.smtpUser,
        smtpPasswordEnc: enc?.enc ?? null,
        smtpPasswordIv: enc?.iv ?? null,
        smtpPasswordTag: enc?.tag ?? null,
        fromEmail: p.fromEmail,
        fromName: p.fromName,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
