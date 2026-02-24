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

export async function embyStopSessionPlayback(baseUrl: string, apiKey: string, sessionId: string) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false as const, status: 400, body: "missing_session_id" };

  const u = new URL(normalizeBaseUrl(baseUrl) + `/Sessions/${encodeURIComponent(sid)}/Playing/Stop`);
  u.searchParams.set("api_key", apiKey);

  const res = await fetch(u.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false as const, status: res.status, body: text };
  return { ok: true as const, status: res.status, body: text };
}

export async function embyRevokeAllUserTokens(baseUrl: string, apiKey: string, embyUserId: string) {
  const base = normalizeBaseUrl(baseUrl);

  // 1. 先获取该用户所有 AuthenticationToken（设备登录记录）
  const listUrl = new URL(`${base}/Users/${encodeURIComponent(embyUserId)}/AuthenticationTokens`);
  listUrl.searchParams.set("api_key", apiKey);

  const listRes = await fetch(listUrl.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  }).catch(() => null);

  if (!listRes || !listRes.ok) {
    // Emby 某些版本不支持该接口，静默跳过
    return { ok: false as const, status: listRes?.status ?? 0, body: "list_tokens_failed", revokedCount: 0 };
  }

  let tokens: { Id?: string; AccessToken?: string }[] = [];
  try {
    tokens = await listRes.json();
    if (!Array.isArray(tokens)) tokens = [];
  } catch {
    tokens = [];
  }

  // 2. 逐个撤销
  let revokedCount = 0;
  const errors: string[] = [];
  for (const t of tokens) {
    const id = String(t?.Id ?? "").trim();
    if (!id) continue;
    const delUrl = new URL(`${base}/AuthenticationTokens/${encodeURIComponent(id)}`);
    delUrl.searchParams.set("api_key", apiKey);
    const r = await fetch(delUrl.toString(), { method: "DELETE", cache: "no-store" }).catch(() => null);
    if (r && (r.ok || r.status === 404)) revokedCount += 1;
    else errors.push(`${id}: ${r?.status ?? "net_err"}`);
  }

  return { ok: true as const, revokedCount, totalTokens: tokens.length, errors: errors.length ? errors.slice(0, 5) : undefined };
}

export async function embyLogoutSession(baseUrl: string, apiKey: string, sessionId: string) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false as const, status: 400, body: "missing_session_id" };

  const u = new URL(normalizeBaseUrl(baseUrl) + `/Sessions/${encodeURIComponent(sid)}`);
  u.searchParams.set("api_key", apiKey);

  const res = await fetch(u.toString(), {
    method: "DELETE",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false as const, status: res.status, body: text };
  return { ok: true as const, status: res.status, body: text };
}
