export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchUsers, normalizeBaseUrl } from "@/lib/emby";
import { embyDeleteUser } from "@/lib/emby-provision";

const PENALTY_RECORDS_KEY = "anomaly_penalty_records";

function ipPrefix3(ip?: string) {
  const m = String(ip || "").match(/^(\d+)\.(\d+)\.(\d+)\./);
  if (!m) return "";
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function detectAnomalyTypeFromIps(ips: string[]) {
  const prefixes = Array.from(new Set((ips || []).map(ipPrefix3).filter(Boolean)));
  return prefixes.length >= 2 ? "CROSS_REGION_MULTI_DEVICE" : "SIMULTANEOUS_MULTI_DEVICE";
}

function anomalyTypeLabel(type?: string | null) {
  return type === "CROSS_REGION_MULTI_DEVICE" ? "异地多设备" : type === "SIMULTANEOUS_MULTI_DEVICE" ? "同时多设备" : null;
}

async function fetchItemCounts(baseUrl: string, apiKey: string) {
  try {
    const u = new URL(normalizeBaseUrl(baseUrl) + "/Items/Counts");
    u.searchParams.set("api_key", apiKey);
    const res = await fetch(u.toString(), { cache: "no-store", headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json) return null;
    return {
      movieCount: Number(json.MovieCount ?? 0),
      seriesCount: Number(json.SeriesCount ?? 0),
      episodeCount: Number(json.EpisodeCount ?? 0),
      songCount: Number(json.SongCount ?? 0),
    };
  } catch {
    return null;
  }
}

async function fetchServerVersion(baseUrl: string, apiKey: string) {
  const base = normalizeBaseUrl(baseUrl);
  try {
    const u = new URL(base + "/System/Info");
    u.searchParams.set("api_key", apiKey);
    const res = await fetch(u.toString(), { cache: "no-store", headers: { Accept: "application/json" } });
    if (res.ok) {
      const json = await res.json().catch(() => null as any);
      const v = String(json?.Version || "").trim();
      if (v) return v;
    }
  } catch {}

  try {
    const res = await fetch(base + "/System/Info/Public", { cache: "no-store", headers: { Accept: "application/json" } });
    if (res.ok) {
      const json = await res.json().catch(() => null as any);
      const v = String(json?.Version || "").trim();
      if (v) return v;
    }
  } catch {}

  return "";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      subscriptions: {
        where: { status: { in: ["ACTIVE", "EXPIRED"] }, planId: { not: null } },
        orderBy: { endAt: "desc" },
        take: 1,
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          plan: { select: { id: true, name: true } },
          servers: { select: { embyServerId: true } },
        },
      },
      embyLinks: { select: { embyServerId: true, embyUserId: true, disabled: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const currentSub = user.subscriptions?.[0] ?? null;
  const now = Date.now();
  const canDeleteExpired = !!(currentSub?.plan?.id && currentSub?.endAt && currentSub.endAt.getTime() <= now);
  const serverIds = new Set<string>([
    ...(currentSub?.servers?.map((s) => s.embyServerId) ?? []),
    ...user.embyLinks.map((l) => l.embyServerId),
  ]);

  const [penaltyRecordsRow, recentAnomalies] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: PENALTY_RECORDS_KEY } }),
    prisma.anomaly.findMany({
      where: {
        userId: user.id,
        embyServerId: { in: Array.from(serverIds) },
        type: "MULTI_DEVICE_CONCURRENCY",
      },
      orderBy: { detectedAt: "desc" },
      take: 100,
      select: { embyServerId: true, detectedAt: true, evidenceJson: true },
    }),
  ]);

  const penaltyRecords = (Array.isArray(penaltyRecordsRow?.valueJson) ? (penaltyRecordsRow!.valueJson as any[]) : []) as any[];

  let servers: any[] = [];
  try {
    servers = await prisma.embyServer.findMany({
      where: { id: { in: Array.from(serverIds) } },
      select: { id: true, name: true, baseUrl: true, externalUrl: true, backupUrl: true, enabled: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true, lastHealthOk: true },
      orderBy: { createdAt: "asc" },
    });
  } catch {
    servers = await prisma.embyServer.findMany({
      where: { id: { in: Array.from(serverIds) } },
      select: { id: true, name: true, baseUrl: true, enabled: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true, lastHealthOk: true },
      orderBy: { createdAt: "asc" },
    });
  }

  const linkMap = new Map(user.embyLinks.map((l) => [l.embyServerId, { embyUserId: l.embyUserId, disabled: !!l.disabled }] as const));

  const pendingPenaltyByServer = new Map<string, any>();
  for (const r of penaltyRecords) {
    if (r?.userId !== user.id || r?.status !== "PENDING" || !r?.embyServerId) continue;
    const prev = pendingPenaltyByServer.get(r.embyServerId);
    if (!prev || String(r?.disabledAt || "") > String(prev?.disabledAt || "")) {
      pendingPenaltyByServer.set(r.embyServerId, r);
    }
  }

  const recentAnomalyByServer = new Map<string, any>();
  for (const a of recentAnomalies) {
    if (!a?.embyServerId) continue;
    if (!recentAnomalyByServer.has(a.embyServerId)) recentAnomalyByServer.set(a.embyServerId, a);
  }

  const list = await Promise.all(
    servers.map(async (s) => {
      const apiKey = getEmbyApiKeyForServer(s as any);
      const [counts, version] = await Promise.all([
        apiKey ? fetchItemCounts(s.baseUrl, apiKey) : Promise.resolve(null),
        apiKey ? fetchServerVersion(s.baseUrl, apiKey) : Promise.resolve(""),
      ]);

      const link = linkMap.get(s.id) ?? null;
      const pendingPenalty = pendingPenaltyByServer.get(s.id) ?? null;
      const recentAnomaly = recentAnomalyByServer.get(s.id) ?? null;
      const recentEvidence: any = recentAnomaly?.evidenceJson ?? {};
      const fallbackType = recentEvidence?.anomalyType || detectAnomalyTypeFromIps(Array.isArray(recentEvidence?.ips) ? recentEvidence.ips : []);
      const banTypeLabel = !!link?.disabled
        ? (pendingPenalty?.anomalyTypeLabel || anomalyTypeLabel(pendingPenalty?.anomalyType) || anomalyTypeLabel(fallbackType))
        : null;
      const onlineNow = !!String(version || "").trim() || s.lastHealthOk === true;
      return {
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        online: onlineNow,
        banned: !!link?.disabled,
        banTypeLabel,
        version,
        baseUrl: s.externalUrl || s.baseUrl,
        backupUrl: (s as any).backupUrl || null,
        embyUserId: link?.embyUserId ?? null,
        counts: counts ?? { movieCount: 0, seriesCount: 0, episodeCount: 0, songCount: 0 },
      };
    })
  );

  const onlineCount = list.filter((x) => x.online).length;
  const aggregate = list.reduce(
    (acc, cur) => {
      acc.movieCount += cur.counts.movieCount || 0;
      acc.seriesCount += cur.counts.seriesCount || 0;
      acc.episodeCount += cur.counts.episodeCount || 0;
      acc.songCount += cur.counts.songCount || 0;
      return acc;
    },
    { movieCount: 0, seriesCount: 0, episodeCount: 0, songCount: 0 }
  );

  return NextResponse.json({
    ok: true,
    subscription: {
      planName: currentSub?.plan?.name ?? "无订阅",
      endAt: currentSub?.endAt ?? null,
      canDeleteExpired,
      serverCount: list.length,
      onlineCount,
    },
    aggregate,
    servers: list,
    user: { username: user.username },
  });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      subscriptions: {
        where: { status: { in: ["ACTIVE", "EXPIRED"] }, planId: { not: null } },
        orderBy: { endAt: "desc" },
        take: 1,
        select: { id: true, endAt: true, servers: { select: { embyServerId: true } } },
      },
      embyLinks: {
        select: {
          embyServerId: true,
          embyUserId: true,
          embyServer: { select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true } },
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const currentSub = user.subscriptions?.[0] ?? null;
  if (!currentSub) return NextResponse.json({ error: "no_subscription" }, { status: 400 });
  if (currentSub.endAt.getTime() > Date.now()) {
    return NextResponse.json({ error: "subscription_not_expired", message: "仅支持删除已到期的订阅计划" }, { status: 400 });
  }

  const linkByServerId = new Map(user.embyLinks.map((l) => [l.embyServerId, l] as const));
  const serverIds = new Set<string>([
    ...(currentSub.servers ?? []).map((x) => x.embyServerId),
    ...user.embyLinks.map((x) => x.embyServerId),
  ]);

  const missingServerIds = Array.from(serverIds).filter((id) => !linkByServerId.has(id));
  const extraServers = missingServerIds.length
    ? await prisma.embyServer.findMany({
        where: { id: { in: missingServerIds } },
        select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
      })
    : [];

  const servers = [
    ...user.embyLinks.map((x) => ({ id: x.embyServerId, baseUrl: x.embyServer.baseUrl, apiKey: x.embyServer.apiKey, apiKeyEnc: x.embyServer.apiKeyEnc, apiKeyIv: x.embyServer.apiKeyIv, apiKeyTag: x.embyServer.apiKeyTag })),
    ...extraServers,
  ];

  const remoteIssues: string[] = [];

  for (const s of servers) {
    const apiKey = getEmbyApiKeyForServer(s as any);
    if (!apiKey) {
      remoteIssues.push(`${s.id}:missing_api_key`);
      continue;
    }

    let embyUserId = linkByServerId.get(s.id)?.embyUserId ?? null;

    if (!embyUserId) {
      try {
        const usersRes = await embyFetchUsers(s.baseUrl, apiKey);
        if (usersRes.ok) {
          const found = usersRes.users.find((x: any) => String(x?.Name ?? "").toLowerCase() === user.username.toLowerCase());
          if (found?.Id) embyUserId = String(found.Id);
        }
      } catch {
        remoteIssues.push(`${s.id}:fetch_user_failed`);
      }
    }

    if (!embyUserId) {
      remoteIssues.push(`${s.id}:user_not_found`);
      continue;
    }

    try {
      const r = await embyDeleteUser(s.baseUrl, apiKey, embyUserId);
      if (!r.ok) remoteIssues.push(`${s.id}:delete_failed`);
    } catch {
      remoteIssues.push(`${s.id}:delete_failed`);
    }
  }

  await prisma.$transaction(async (tx) => {
    const subIds = await tx.subscription.findMany({ where: { userId: user.id }, select: { id: true } });
    const idList = subIds.map((x) => x.id);

    if (idList.length) {
      await tx.subscriptionServer.deleteMany({ where: { subscriptionId: { in: idList } } });
      await tx.subscription.updateMany({
        where: { id: { in: idList }, status: { in: ["ACTIVE", "EXPIRED"] } },
        data: { status: "CANCELED" },
      });
    }

    await tx.embyUserLink.deleteMany({ where: { userId: user.id } });
  });

  if (remoteIssues.length) {
    return NextResponse.json({ ok: true, warn: "subscription_deleted_remote_partial", issues: remoteIssues });
  }

  return NextResponse.json({ ok: true });
}
