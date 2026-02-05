import { normalizeBaseUrl } from "@/lib/emby";

export type EmbyPlugin = {
  Name?: string;
  Version?: string;
  ConfigurationFileName?: string;
  Id?: string;
};

export async function embyFetchPlugins(baseUrl: string, apiKey: string) {
  const u = new URL(normalizeBaseUrl(baseUrl) + "/Plugins");
  u.searchParams.set("api_key", apiKey);

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) return { ok: false as const, status: res.status, body: text };
  const json = JSON.parse(text);
  return { ok: true as const, status: res.status, plugins: json as EmbyPlugin[] };
}

export function hasPlaybackReportingPlugin(plugins: EmbyPlugin[]) {
  const names = (plugins ?? []).map((p) => String(p?.Name ?? "").toLowerCase());
  return names.some((n) => n.includes("playback") && n.includes("report"));
}
