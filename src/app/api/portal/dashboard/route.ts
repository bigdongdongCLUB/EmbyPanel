export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { normalizeBaseUrl } from "@/lib/emby";

function daysLeft(endAt?: Date | null) {
  if (!endAt) return 0;
  const diff = endAt.getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 3600 * 1000));
}

type RecentItem = {
  id: string;
  title: string;
  type: "MOVIE" | "TV";
  year: string;
  imageUrl: string | null;
  serverName: string;
  ts: number;
};

async function fetchServerRecent(baseUrl: string, apiKey: string, serverName: string): Promise<RecentItem[]> {
  const base = normalizeBaseUrl(baseUrl);
  const u = new URL(base + "/Items/Latest");
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("Limit", "30");
  u.searchParams.set("Fields", "DateCreated,PremiereDate,ProductionYear,ImageTags,Type");

  const res = await fetch(u.toString(), { cache: "no-store", signal: AbortSignal.timeout(7000) });
  if (!res.ok) return [];
  const arr = (await res.json().catch(() => [])) as any[];
  if (!Array.isArray(arr)) return [];

  return arr
    .filter((x) => x && x.Id && (x.Type === "Movie" || x.Type === "Series"))
    .map((x) => {
      const tsRaw = x.DateCreated || x.PremiereDate || x.DateLastMediaAdded || null;
      const ts = tsRaw ? new Date(tsRaw).getTime() : 0;
      const imageTag = x.ImageTags?.Primary;
      const imageUrl = imageTag ? `${base}/Items/${x.Id}/Images/Primary?fillHeight=420&fillWidth=280&quality=90&tag=${imageTag}` : null;
      const year = String(x.ProductionYear || "");
      return {
        id: String(x.Id),
        title: String(x.Name || ""),
        type: x.Type === "Movie" ? "MOVIE" : "TV",
        year,
        imageUrl,
        serverName,
        ts: Number.isFinite(ts) ? ts : 0,
      } as RecentItem;
    });
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
      balanceCents: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        orderBy: { endAt: "desc" },
        take: 1,
        select: { endAt: true, startAt: true, payCycle: true, plan: { select: { name: true } } },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sub = user.subscriptions?.[0] ?? null;
  const endAt = sub?.endAt ?? null;

  const row = await prisma.appSetting.findUnique({ where: { key: "announcements_list" } });
  const raw = Array.isArray(row?.valueJson) ? (row!.valueJson as any[]) : [];
  const announcements = raw
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map((x) => ({ id: String(x.id || ""), title: String(x.title || ""), content: String(x.content || "") }));

  if (!announcements.length) {
    announcements.push({
      id: "default",
      title: "系统公告",
      content: "欢迎使用用户中心。购买订阅或使用卡密兑换后，可在此查看最新订阅状态与剩余时间。",
    });
  }

  const links = await prisma.embyUserLink.findMany({
    where: { userId: user.id, disabled: false },
    include: { embyServer: true },
  });

  const recentFromServers = await Promise.all(
    links.map(async (link) => {
      const server = link.embyServer;
      if (!server?.enabled || !server?.baseUrl) return [] as RecentItem[];
      try {
        const apiKey = getEmbyApiKeyForServer(server as any);
        if (!apiKey) return [] as RecentItem[];
        return await fetchServerRecent(server.baseUrl, apiKey, server.name || "服务器");
      } catch {
        return [] as RecentItem[];
      }
    })
  );

  const mergedRecent = recentFromServers
    .flat()
    .sort((a, b) => b.ts - a.ts)
    .filter((x, idx, arr) => arr.findIndex((k) => `${k.serverName}:${k.id}` === `${x.serverName}:${x.id}`) === idx)
    .slice(0, 18);

  return NextResponse.json({
    ok: true,
    dashboard: {
      balanceYuan: (user.balanceCents ?? 0) / 100,
      subscriptionEndAt: endAt,
      subscriptionPlan: sub?.plan?.name ?? "无订阅",
      remainingDays: daysLeft(endAt),
    },
    announcements,
    recentUpdates: mergedRecent,
  });
}
