import { normalizeBaseUrl } from "@/lib/emby";
import { embyClonePolicyFromTemplate } from "@/lib/emby-user-policy";

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

export async function embyCreateUser(baseUrl: string, apiKey: string, username: string) {
  // Emby/Jellyfin variants differ slightly; try a few common shapes.
  const url1 = new URL(normalizeBaseUrl(baseUrl) + "/Users/New");
  url1.searchParams.set("api_key", apiKey);
  url1.searchParams.set("Name", username);

  const url2 = new URL(normalizeBaseUrl(baseUrl) + "/Users/New");
  url2.searchParams.set("api_key", apiKey);

  const res = await tryRequest([
    () =>
      fetch(url1.toString(), {
        method: "POST",
        headers: { Accept: "application/json" },
      }),
    () =>
      fetch(url2.toString(), {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ Name: username }),
      }),
  ]);

  const json = await res.json().catch(() => null);
  const id = json?.Id ?? json?.id ?? json?.UserId;
  if (!id) {
    return { ok: false as const, status: res.status, json };
  }
  return { ok: true as const, status: res.status, userId: String(id), json };
}

export async function embySetUserPassword(baseUrl: string, apiKey: string, embyUserId: string, newPassword: string) {
  const url = new URL(normalizeBaseUrl(baseUrl) + `/Users/${encodeURIComponent(embyUserId)}/Password`);
  url.searchParams.set("api_key", apiKey);

  const res = await tryRequest([
    () =>
      fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ CurrentPw: "", NewPw: newPassword }),
      }),
    () =>
      fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ NewPw: newPassword }),
      }),
  ]);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false as const, status: res.status, body };
  }
  return { ok: true as const, status: res.status };
}

export async function embySetUserDisabled(baseUrl: string, apiKey: string, embyUserId: string, disabled: boolean) {
  const getUrl = new URL(normalizeBaseUrl(baseUrl) + `/Users/${encodeURIComponent(embyUserId)}/Policy`);
  getUrl.searchParams.set("api_key", apiKey);

  // Fetch current policy (best-effort)
  const current = await fetch(getUrl.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const policy = typeof current === "object" && current ? current : {};
  (policy as any).IsDisabled = !!disabled;

  const postUrl = new URL(normalizeBaseUrl(baseUrl) + `/Users/${encodeURIComponent(embyUserId)}/Policy`);
  postUrl.searchParams.set("api_key", apiKey);

  const res = await fetch(postUrl.toString(), {
    method: "POST",
    headers: { "content-type": "application/json", Accept: "application/json" },
    body: JSON.stringify(policy),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false as const, status: res.status, body };
  }

  return { ok: true as const, status: res.status };
}

export async function embyApplyTemplatePolicy(baseUrl: string, apiKey: string, targetEmbyUserId: string, templateEmbyUserId: string) {
  const res = await embyClonePolicyFromTemplate(baseUrl, apiKey, templateEmbyUserId, targetEmbyUserId);
  if (!(res as any)?.ok) {
    return { ok: false as const, error: "template_policy_apply_failed", detail: res };
  }
  return { ok: true as const };
}

export async function embyDeleteUser(baseUrl: string, apiKey: string, embyUserId: string) {
  const url1 = new URL(normalizeBaseUrl(baseUrl) + `/Users/${encodeURIComponent(embyUserId)}`);
  url1.searchParams.set("api_key", apiKey);

  const url2 = new URL(normalizeBaseUrl(baseUrl) + `/Users/${encodeURIComponent(embyUserId)}/Delete`);
  url2.searchParams.set("api_key", apiKey);

  const res = await tryRequest([
    () => fetch(url1.toString(), { method: "DELETE", headers: { Accept: "application/json" } }),
    () => fetch(url2.toString(), { method: "POST", headers: { Accept: "application/json" } }),
    () => fetch(url2.toString(), { method: "DELETE", headers: { Accept: "application/json" } }),
  ]);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false as const, status: res.status, body };
  }
  return { ok: true as const, status: res.status };
}
