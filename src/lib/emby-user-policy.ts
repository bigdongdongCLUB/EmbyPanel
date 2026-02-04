import { normalizeBaseUrl } from "@/lib/emby";

async function tryRequest(reqs: Array<() => Promise<Response>>) {
  let last: any = null;
  for (const fn of reqs) {
    try {
      const res = await fn();
      if (res.ok) return res;
      last = res;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export async function embyFetchUserPolicy(baseUrl: string, apiKey: string, embyUserId: string) {
  const url = new URL(normalizeBaseUrl(baseUrl) + `/Users/${encodeURIComponent(embyUserId)}/Policy`);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) return { ok: false as const, status: res.status, body: text };

  const json = JSON.parse(text);
  return { ok: true as const, status: res.status, policy: json };
}

export async function embySetUserPolicy(baseUrl: string, apiKey: string, embyUserId: string, policy: any) {
  const url = new URL(normalizeBaseUrl(baseUrl) + `/Users/${encodeURIComponent(embyUserId)}/Policy`);
  url.searchParams.set("api_key", apiKey);

  const res = await tryRequest([
    () =>
      fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify(policy ?? {}),
      }),
  ]);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false as const, status: res.status, body };
  }

  return { ok: true as const, status: res.status };
}

export async function embyClonePolicyFromTemplate(baseUrl: string, apiKey: string, templateEmbyUserId: string, targetEmbyUserId: string) {
  const [tpl, cur] = await Promise.all([
    embyFetchUserPolicy(baseUrl, apiKey, templateEmbyUserId),
    embyFetchUserPolicy(baseUrl, apiKey, targetEmbyUserId),
  ]);
  if (!tpl.ok) return tpl;
  if (!cur.ok) return cur;

  // Some Emby versions are picky: POST /Policy expects a full-ish policy object.
  // Safer approach: take current policy as base, then overlay template fields.
  const templatePolicy = typeof tpl.policy === "object" && tpl.policy ? (tpl.policy as any) : {};
  const currentPolicy = typeof cur.policy === "object" && cur.policy ? (cur.policy as any) : {};

  const merged: any = { ...currentPolicy, ...templatePolicy };

  // Do not copy these bits from template; keep panel-controlled.
  merged.IsAdministrator = currentPolicy.IsAdministrator;
  merged.IsDisabled = currentPolicy.IsDisabled;

  return embySetUserPolicy(baseUrl, apiKey, targetEmbyUserId, merged);
}
