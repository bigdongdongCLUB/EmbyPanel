import { normalizeBaseUrl } from "@/lib/emby";

export type EmbyItem = {
  Id?: string;
  Name?: string;
  Type?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  ProductionYear?: number;
  PlayCount?: number;
  UserData?: {
    PlayCount?: number;
    LastPlayedDate?: string;
  };
  DateLastPlayed?: string;
};

export async function embyFetchTopPlayedItems(params: {
  baseUrl: string;
  apiKey: string;
  includeItemTypes: string[]; // e.g. ["Movie"] or ["Episode"]
  limit: number;
  since?: Date; // filter by LastPlayedDate/DateLastPlayed if available
}) {
  const u = new URL(normalizeBaseUrl(params.baseUrl) + "/Items");
  u.searchParams.set("api_key", params.apiKey);
  u.searchParams.set("Recursive", "true");
  u.searchParams.set("IncludeItemTypes", params.includeItemTypes.join(","));
  u.searchParams.set("SortBy", "PlayCount");
  u.searchParams.set("SortOrder", "Descending");
  u.searchParams.set("Limit", String(params.limit));
  u.searchParams.set("Fields", "DateLastPlayed,PlayCount,SeriesName,ParentIndexNumber,IndexNumber");

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) return { ok: false as const, status: res.status, body: text };

  const json = JSON.parse(text);
  let items: EmbyItem[] = (json?.Items ?? []) as any;

  if (params.since) {
    const sinceMs = params.since.getTime();
    items = items.filter((it: any) => {
      const last = it?.UserData?.LastPlayedDate ?? it?.DateLastPlayed;
      if (!last) return false;
      const d = new Date(last);
      if (Number.isNaN(d.getTime())) return false;
      return d.getTime() >= sinceMs;
    });
  }

  return { ok: true as const, status: res.status, items };
}
