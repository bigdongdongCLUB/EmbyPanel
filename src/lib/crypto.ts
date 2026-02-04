import crypto from "node:crypto";
import { z } from "zod";

// 32 bytes base64 key (AES-256-GCM)
const keySchema = z
  .string()
  .min(1)
  .transform((s) => Buffer.from(s, "base64"))
  .refine((b) => b.length === 32, "EMBYPANEL_ENCRYPTION_KEY must be base64-encoded 32 bytes");

function getKey() {
  const raw = process.env.EMBYPANEL_ENCRYPTION_KEY;
  if (!raw) throw new Error("Missing EMBYPANEL_ENCRYPTION_KEY");
  return keySchema.parse(raw);
}

export type Encrypted = {
  enc: string; // base64 ciphertext
  iv: string; // base64 iv
  tag: string; // base64 auth tag
};

export function encryptString(plain: string): Encrypted {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptString(enc: Encrypted): string {
  const key = getKey();
  const iv = Buffer.from(enc.iv, "base64");
  const tag = Buffer.from(enc.tag, "base64");
  const data = Buffer.from(enc.enc, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString("utf8");
}
