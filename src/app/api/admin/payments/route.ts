export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const KEY = "payment_methods";

const EpaySchema = z.object({
  merchantId: z.string().min(1),
  merchantKey: z.string().min(1),
  apiBaseUrl: z.string().url(),
  paymentType: z.enum(["alipay", "wxpay", "qqpay", "bank"]),
  signType: z.enum(["MD5", "HMAC-SHA256"]).default("MD5"),
  sandbox: z.boolean().optional().default(false),
});

const StripeSchema = z.object({
  secretKey: z.string().min(1),
  webhookSecret: z.string().min(1),
  publishableKey: z.string().optional().default(""),
});

const PaymentSchema = z.discriminatedUnion("processor", [
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional().default(""),
    processor: z.literal("epay"),
    iconType: z.enum(["preset", "none"]).default("preset"),
    presetIcon: z.string().default("wallet"),
    priority: z.number().int().default(0),
    feeEnabled: z.boolean().default(false),
    feePercent: z.number().min(0).max(100).default(0),
    enabled: z.boolean().default(true),
    createdAt: z.string(),
    updatedAt: z.string(),
    config: EpaySchema,
  }),
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional().default(""),
    processor: z.literal("stripe"),
    iconType: z.enum(["preset", "none"]).default("preset"),
    presetIcon: z.string().default("wallet"),
    priority: z.number().int().default(0),
    feeEnabled: z.boolean().default(false),
    feePercent: z.number().min(0).max(100).default(0),
    enabled: z.boolean().default(true),
    createdAt: z.string(),
    updatedAt: z.string(),
    config: StripeSchema,
  }),
]);

const CreateSchema = z.discriminatedUnion("processor", [
  z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional().default(""),
    processor: z.literal("epay"),
    iconType: z.enum(["preset", "none"]).default("preset"),
    presetIcon: z.string().default("wallet"),
    priority: z.coerce.number().int().default(0),
    feeEnabled: z.boolean().default(false),
    feePercent: z.coerce.number().min(0).max(100).default(0),
    enabled: z.boolean().default(true),
    config: EpaySchema,
  }),
  z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional().default(""),
    processor: z.literal("stripe"),
    iconType: z.enum(["preset", "none"]).default("preset"),
    presetIcon: z.string().default("wallet"),
    priority: z.coerce.number().int().default(0),
    feeEnabled: z.boolean().default(false),
    feePercent: z.coerce.number().min(0).max(100).default(0),
    enabled: z.boolean().default(true),
    config: StripeSchema,
  }),
]);

async function readList() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const raw = Array.isArray(row?.valueJson) ? row?.valueJson : [];
  const out: any[] = [];
  for (const item of raw as any[]) {
    const parsed = PaymentSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

async function saveList(list: any[]) {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, valueJson: list },
    update: { valueJson: list },
  });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const list = await readList();
  list.sort((a, b) => a.priority - b.priority || String(a.name).localeCompare(String(b.name)));
  return NextResponse.json({ ok: true, items: list });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const list = await readList();
  const now = new Date().toISOString();
  const payload = parsed.data;
  const id = payload.id?.trim() || crypto.randomUUID();

  const idx = list.findIndex((x) => x.id === id);
  const row = { ...payload, id, createdAt: idx >= 0 ? list[idx].createdAt : now, updatedAt: now };
  if (idx >= 0) list[idx] = row;
  else list.push(row);

  await saveList(list);
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const list = await readList();
  const next = list.filter((x) => x.id !== id);
  await saveList(next);
  return NextResponse.json({ ok: true });
}
