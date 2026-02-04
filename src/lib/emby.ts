import { z } from "zod";

export const EmbyServerInfoSchema = z.object({
  ServerName: z.string().optional(),
  Version: z.string().optional(),
  Id: z.string().optional(),
});

export function normalizeBaseUrl(url: string) {
  // trim trailing slashes
  return url.trim().replace(/\/+$/, "");
}

export async function embyFetchSystemInfo(baseUrl: string, apiKey: string) {
  const u = new URL(normalizeBaseUrl(baseUrl) + "/System/Info");
  // Emby supports api_key query param
  u.searchParams.set("api_key", apiKey);

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    // Emby is usually self-hosted; avoid caching
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    return { ok: false as const, status: res.status, body: text };
  }

  const json = JSON.parse(text);
  const parsed = EmbyServerInfoSchema.safeParse(json);
  return { ok: true as const, status: res.status, json, parsed };
}
