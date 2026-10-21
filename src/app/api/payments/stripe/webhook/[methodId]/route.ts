export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { processStripeWebhook } from "@/lib/stripe-payments";
export async function POST(req: Request, ctx: { params: Promise<{ methodId: string }> }) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 1024 * 1024) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const { methodId } = await ctx.params;
  try { await processStripeWebhook(methodId, raw, signature); return NextResponse.json({ received: true }); }
  catch (error) {
    const signatureError = error instanceof SyntaxError || (error instanceof Error && ["StripeSignatureVerificationError", "invalid_webhook"].includes(error.name === "Error" ? error.message : error.name));
    return NextResponse.json({ error: signatureError ? "invalid_webhook" : "webhook_processing_failed" }, { status: signatureError ? 400 : 500 });
  }
}
