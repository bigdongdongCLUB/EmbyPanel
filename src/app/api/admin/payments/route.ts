export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { preservePaymentSecrets, redactPaymentMethod } from "@/lib/payment-secrets";
import { lockPaymentSettings, readStoredPaymentMethods, saveStoredPaymentMethods, stripeMethodsFromStored, stripeMethodReady, StripeMethodSchema, validateStripeMethod } from "@/lib/payment-methods";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const items = await prisma.$transaction(async (tx) => {
      await lockPaymentSettings(tx);
      return stripeMethodsFromStored(await readStoredPaymentMethods(tx)).map((method) => ({ ...redactPaymentMethod(method), ready: stripeMethodReady(method), webhookPath: `/api/payments/stripe/webhook/${method.id}` }));
    });
    return NextResponse.json({ ok: true, items }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "payment_settings_unavailable" }, { status: 500 }); }
}
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => null);
  if (!body || body.processor !== "stripe" || !body.config || typeof body.config !== "object") return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  try {
    const id = await prisma.$transaction(async (tx) => {
      await lockPaymentSettings(tx);
      const list = await readStoredPaymentMethods(tx);
      const existing = list.find((m) => m.id === body.id && m.processor === "stripe");
      const now = new Date().toISOString();
      const method = StripeMethodSchema.parse({ ...body, id: existing?.id ?? crypto.randomUUID(), createdAt: existing?.createdAt ?? now, updatedAt: now, config: preservePaymentSecrets(body.config, existing?.config) });
      validateStripeMethod(method.enabled ? method : { ...method, config: { ...method.config, webhookSecret: method.config.webhookSecret || "whsec_pending" } });
      const index = list.findIndex((m) => m.id === method.id);
      if (index >= 0) list[index] = method;
      else list.push(method);
      await saveStoredPaymentMethods(tx, list);
      return method.id;
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = ["invalid_site_url", "stripe_key_mode_mismatch", "stripe_webhook_secret_required"];
    return NextResponse.json({ error: known.includes(message) ? message : "payment_settings_save_failed" }, { status: 400 });
  }
}
export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    await prisma.$transaction(async (tx) => {
      await lockPaymentSettings(tx);
      const list = await readStoredPaymentMethods(tx);
      await saveStoredPaymentMethods(tx, list.filter((m) => m.id !== id));
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "payment_settings_save_failed" }, { status: 500 }); }
}
