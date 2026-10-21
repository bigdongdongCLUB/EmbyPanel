import { decryptString, encryptString } from "@/lib/crypto";

const PREFIX = "encrypted:v1:";
const secretFields = ["merchantKey", "secretKey", "webhookSecret"] as const;

type Method = { config: Record<string, unknown> };

export function hasPlaintextPaymentSecrets(method: Method) {
  return secretFields.some((field) => {
    const value = method.config[field];
    return typeof value === "string" && !!value && !value.startsWith(PREFIX);
  });
}

export function encryptPaymentMethod<T extends Method>(method: T): T {
  const config = { ...method.config };
  for (const field of secretFields) {
    const value = config[field];
    if (typeof value === "string" && value && !value.startsWith(PREFIX)) {
      config[field] = PREFIX + JSON.stringify(encryptString(value));
    }
  }
  return { ...method, config };
}

export function decryptPaymentMethod<T extends Method>(method: T): T {
  const config = { ...method.config };
  for (const field of secretFields) {
    const value = config[field];
    if (typeof value === "string" && value.startsWith(PREFIX)) {
      config[field] = decryptString(JSON.parse(value.slice(PREFIX.length)));
    }
  }
  return { ...method, config };
}

export function redactPaymentMethod<T extends Method>(method: T) {
  const config = { ...method.config };
  for (const field of secretFields) {
    config[`has${field[0].toUpperCase()}${field.slice(1)}`] = !!config[field];
    if (field in config) config[field] = "";
  }
  return { ...method, config };
}

export function preservePaymentSecrets(config: Record<string, unknown>, previous?: Record<string, unknown>) {
  const merged = { ...config };
  for (const field of secretFields) {
    if (!merged[field] && previous?.[field]) merged[field] = previous[field];
    if (typeof merged[field] === "string" && merged[field].startsWith(PREFIX)) throw new Error("invalid_secret");
  }
  return merged;
}
