import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { decryptPaymentMethod, encryptPaymentMethod, hasPlaintextPaymentSecrets } from "@/lib/payment-secrets";

export const PAYMENT_METHODS_KEY = "payment_methods";
export const StripeConfigSchema = z.object({
  secretKey: z.string().default(""), webhookSecret: z.string().default(""),
  publishableKey: z.string().default(""), siteUrl: z.string().default(""),
  mode: z.enum(["test", "live"]).default("test"),
});
export const StripeMethodSchema = z.object({
  id: z.string().min(1), name: z.string().min(1).max(80), description: z.string().max(300).default(""),
  processor: z.literal("stripe"), priority: z.coerce.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(false), feeEnabled: z.boolean().default(false),
  feePercent: z.coerce.number().min(0).max(100).default(0),
  createdAt: z.string(), updatedAt: z.string(), config: StripeConfigSchema,
});
export type StripeMethod = z.infer<typeof StripeMethodSchema>;
export type StoredMethod = Record<string, unknown> & { id: string; processor: string; config: Record<string, unknown> };

export function stripeSiteUrl(value: string, mode: "test" | "live") {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("invalid_site_url");
  if (url.protocol !== "https:" && !(mode === "test" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("invalid_site_url");
  return url.origin;
}
export function validateStripeMethod(method: StripeMethod) {
  if (!new RegExp(`^[sr]k_${method.config.mode}_[A-Za-z0-9]+$`).test(method.config.secretKey)) throw new Error("stripe_key_mode_mismatch");
  if (!/^whsec_[A-Za-z0-9]+$/.test(method.config.webhookSecret)) throw new Error("stripe_webhook_secret_required");
  stripeSiteUrl(method.config.siteUrl, method.config.mode);
}
export function stripeMethodReady(method: StripeMethod) {
  try { validateStripeMethod(method); return true; } catch { return false; }
}
export async function readStoredPaymentMethods(tx: Prisma.TransactionClient): Promise<StoredMethod[]> {
  const setting = await tx.appSetting.findUnique({ where: { key: PAYMENT_METHODS_KEY } });
  if (!setting) return [];
  const stored = z.array(z.object({ id: z.string(), processor: z.string(), config: z.record(z.string(), z.unknown()) }).passthrough()).parse(setting.valueJson);
  const list = stored.map(decryptPaymentMethod);
  if (stored.some(hasPlaintextPaymentSecrets)) await saveStoredPaymentMethods(tx, list);
  return list;
}
export async function saveStoredPaymentMethods(tx: Prisma.TransactionClient, methods: StoredMethod[]) {
  const valueJson = methods.map(encryptPaymentMethod) as Prisma.InputJsonValue;
  await tx.appSetting.upsert({ where: { key: PAYMENT_METHODS_KEY }, create: { key: PAYMENT_METHODS_KEY, valueJson }, update: { valueJson } });
}
export async function lockPaymentSettings(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(731025, 2)`;
}
export function stripeMethodsFromStored(methods: StoredMethod[]) {
  return methods.filter((m) => m.processor === "stripe").map((m) => StripeMethodSchema.parse({
    ...m, config: { ...m.config, mode: m.config.mode ?? (String(m.config.secretKey).startsWith("sk_live_") || String(m.config.secretKey).startsWith("rk_live_") ? "live" : "test") },
  })).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}
