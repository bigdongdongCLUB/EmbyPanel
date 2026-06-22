import { normalizeBaseUrl } from "@/lib/emby";

export async function embyFetchUserPolicy(baseUrl: string, apiKey: string, embyUserId: string) {
  // Some Emby deployments do not support GET /Users/{id}/Policy (404),
  // but the policy is available on GET /Users/{id} as a field.
  const url1 = new URL(normalizeBaseUrl(baseUrl) + `/Users/${encodeURIComponent(embyUserId)}/Policy`);
  url1.searchParams.set("api_key", apiKey);

  const res1 = await fetch(url1.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (res1.ok) {
    const text = await res1.text();
    const json = JSON.parse(text);
    return { ok: true as const, status: res1.status, policy: json };
  }

  const url2 = new URL(normalizeBaseUrl(baseUrl) + `/Users/${encodeURIComponent(embyUserId)}`);
  url2.searchParams.set("api_key", apiKey);

  const res2 = await fetch(url2.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text2 = await res2.text();
  if (!res2.ok) return { ok: false as const, status: res2.status, body: text2 };

  const json2 = JSON.parse(text2);
  return { ok: true as const, status: res2.status, policy: (json2 as any)?.Policy ?? {} };
}

export async function embySetUserPolicy(baseUrl: string, apiKey: string, embyUserId: string, policy: any) {
  const url = new URL(normalizeBaseUrl(baseUrl) + `/Users/${encodeURIComponent(embyUserId)}/Policy`);
  url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify(policy ?? {}),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) return { ok: false as const, status: res.status, body };
    return { ok: true as const, status: res.status };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false as const, status: 0, body: message || "fetch_failed" };
  }
}

export async function embyClonePolicyFromTemplate(baseUrl: string, apiKey: string, templateEmbyUserId: string, targetEmbyUserId: string) {
  const [tpl, cur] = await Promise.all([
    embyFetchUserPolicy(baseUrl, apiKey, templateEmbyUserId),
    embyFetchUserPolicy(baseUrl, apiKey, targetEmbyUserId),
  ]);
  if (!tpl.ok) return tpl;
  if (!cur.ok) return cur;

  // Use template policy as the source of truth.
  // Keep a couple of fields panel-controlled.
  const templatePolicy = typeof tpl.policy === "object" && tpl.policy ? (tpl.policy as any) : {};
  const currentPolicy = typeof cur.policy === "object" && cur.policy ? (cur.policy as any) : {};

  const next: any = { ...templatePolicy };
  next.IsAdministrator = currentPolicy.IsAdministrator;
  next.IsDisabled = currentPolicy.IsDisabled;

  return embySetUserPolicy(baseUrl, apiKey, targetEmbyUserId, next);
}

export async function embyClearSimultaneousStreamLimit(baseUrl: string, apiKey: string, embyUserId: string) {
  const cur = await embyFetchUserPolicy(baseUrl, apiKey, embyUserId);
  if (!cur.ok) return cur;

  const currentPolicy = typeof cur.policy === "object" && cur.policy ? (cur.policy as any) : {};
  const nextPolicy: any = { ...currentPolicy };

  // 0 means unlimited on Emby/Jellyfin-style policy models.
  nextPolicy.SimultaneousStreamLimit = 0;

  return embySetUserPolicy(baseUrl, apiKey, embyUserId, nextPolicy);
}

export async function embySetMediaPlaybackEnabled(baseUrl: string, apiKey: string, embyUserId: string, enabled: boolean) {
  const cur = await embyFetchUserPolicy(baseUrl, apiKey, embyUserId);
  if (!cur.ok) return cur;

  const currentPolicy =
    typeof cur.policy === "object" && cur.policy && !Array.isArray(cur.policy)
      ? (cur.policy as Record<string, unknown>)
      : {};
  // Emby treats an omitted EnableMediaPlayback value as enabled. Save that
  // effective value so a temporary penalty can restore the original policy.
  const previousEnableMediaPlayback =
    typeof currentPolicy.EnableMediaPlayback === "boolean" ? currentPolicy.EnableMediaPlayback : true;
  const nextPolicy: Record<string, unknown> = { ...currentPolicy, EnableMediaPlayback: enabled };
  const result = await embySetUserPolicy(baseUrl, apiKey, embyUserId, nextPolicy);

  return { ...result, previousEnableMediaPlayback };
}

export async function embySetAccountPlaybackAccess(
  baseUrl: string,
  apiKey: string,
  embyUserId: string,
  options: { disabled: boolean; mediaPlaybackEnabled: boolean }
) {
  const cur = await embyFetchUserPolicy(baseUrl, apiKey, embyUserId);
  if (!cur.ok) return cur;

  const currentPolicy =
    typeof cur.policy === "object" && cur.policy && !Array.isArray(cur.policy)
      ? (cur.policy as Record<string, unknown>)
      : {};
  const previousIsDisabled = typeof currentPolicy.IsDisabled === "boolean" ? currentPolicy.IsDisabled : false;
  const previousEnableMediaPlayback =
    typeof currentPolicy.EnableMediaPlayback === "boolean" ? currentPolicy.EnableMediaPlayback : true;
  const nextPolicy: Record<string, unknown> = {
    ...currentPolicy,
    IsDisabled: options.disabled,
    EnableMediaPlayback: options.mediaPlaybackEnabled,
  };
  const result = await embySetUserPolicy(baseUrl, apiKey, embyUserId, nextPolicy);

  return { ...result, previousIsDisabled, previousEnableMediaPlayback };
}
