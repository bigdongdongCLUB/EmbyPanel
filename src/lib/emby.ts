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
  u.searchParams.set("api_key", apiKey);

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) return { ok: false as const, status: res.status, body: text };

  const json = JSON.parse(text);
  const parsed = EmbyServerInfoSchema.safeParse(json);
  return { ok: true as const, status: res.status, json, parsed };
}

type EmbyUser = {
  Id: string;
  Name: string;
  Policy?: {
    IsAdministrator?: boolean;
    IsDisabled?: boolean;
  };
  LastLoginDate?: string;
  LastActivityDate?: string;
};

export async function embyFetchUsers(baseUrl: string, apiKey: string) {
  const u = new URL(normalizeBaseUrl(baseUrl) + "/Users");
  u.searchParams.set("api_key", apiKey);

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) return { ok: false as const, status: res.status, body: text };

  const json = JSON.parse(text);
  return { ok: true as const, status: res.status, users: json as EmbyUser[] };
}
