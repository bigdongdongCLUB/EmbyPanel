import { normalizeBaseUrl } from "@/lib/emby";

export type EmbySession = {
  Id?: string;
  UserId?: string;
  UserName?: string;
  DeviceName?: string;
  Client?: string;
  ApplicationVersion?: string;
  RemoteEndPoint?: string;
  SupportsTranscoding?: boolean;
  NowPlayingItem?: {
    Name?: string;
    SeriesName?: string;
    SeasonName?: string;
    IndexNumber?: number;
    ParentIndexNumber?: number;
    ProductionYear?: number;
    Type?: string;
  };
  PlayState?: {
    IsPaused?: boolean;
  };
};

export async function embyFetchSessions(baseUrl: string, apiKey: string) {
  const u = new URL(normalizeBaseUrl(baseUrl) + "/Sessions");
  u.searchParams.set("api_key", apiKey);

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) return { ok: false as const, status: res.status, body: text };

  const json = JSON.parse(text);
  return { ok: true as const, status: res.status, sessions: json as EmbySession[] };
}
