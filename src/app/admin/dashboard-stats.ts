import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchUsers } from "@/lib/emby";

const DASHBOARD_ACTIVE30D_CACHE_KEY = "admin_dashboard_active30d_snapshot";
const DASHBOARD_USER_TREND_CACHE_KEY = "admin_dashboard_user_trend_30d_snapshot";
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export type UserTrendPoint = {
  date: string;
  label: string;
  activeUsers: number;
  totalUsers: number;
};

export type UserTrendSeries = {
  id: string;
  name: string;
  data: UserTrendPoint[];
};

export type DashboardStats = {
  panelUserCount: number;
  embyActive30dTotal: number;
  expiringSoonCount: number;
  expiringSoonDays: number;
  perServer: Array<{ id: string; name: string; active30d: number; totalUsers: number; ok: boolean; error?: string }>;
  activeSnapshotAt: string | null;
  userTrend30d: UserTrendSeries[];
};

type ActiveSnapshot = {
  embyActive30dTotal: number;
  perServer: DashboardStats["perServer"];
  snapshotAt: string;
};

type UserTrendSnapshot = {
  series: UserTrendSeries[];
  snapshotAt: string;
};

export async function buildActive30dSnapshot(): Promise<ActiveSnapshot> {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const servers = await prisma.embyServer.findMany({
    where: { enabled: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      baseUrl: true,
      apiKey: true,
      apiKeyEnc: true,
      apiKeyIv: true,
      apiKeyTag: true,
    },
  });

  let embyActive30dTotal = 0;
  const perServer: DashboardStats["perServer"] = [];

  for (const s of servers) {
    try {
      const apiKey = getEmbyApiKeyForServer(s);
      const res = await embyFetchUsers(s.baseUrl, apiKey);
      if (!res.ok) throw new Error(`fetch_users_failed:${res.status}`);

      const totalUsers = res.users.length;
      const active30d = res.users.filter((u) => {
        const last = u.LastActivityDate;
        if (!last) return false;
        const d = new Date(last);
        if (Number.isNaN(d.getTime())) return false;
        return d >= since;
      }).length;

      embyActive30dTotal += active30d;
      perServer.push({ id: s.id, name: s.name, active30d, totalUsers, ok: true });
    } catch (e: unknown) {
      perServer.push({ id: s.id, name: s.name, active30d: 0, totalUsers: 0, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    embyActive30dTotal,
    perServer,
    snapshotAt: now.toISOString(),
  };
}

export async function refreshActive30dSnapshot() {
  const snap = await buildActive30dSnapshot();
  const valueJson: Prisma.InputJsonObject = {
    embyActive30dTotal: snap.embyActive30dTotal,
    perServer: snap.perServer.map((server) => ({
      id: server.id,
      name: server.name,
      active30d: server.active30d,
      totalUsers: server.totalUsers,
      ok: server.ok,
      ...(server.error ? { error: server.error } : {}),
    })),
    snapshotAt: snap.snapshotAt,
  };
  await prisma.appSetting.upsert({
    where: { key: DASHBOARD_ACTIVE30D_CACHE_KEY },
    create: { key: DASHBOARD_ACTIVE30D_CACHE_KEY, valueJson },
    update: { valueJson },
  });
  await refreshUserTrend30dSnapshot();
  return snap;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

async function readActive30dSnapshot(): Promise<ActiveSnapshot | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: DASHBOARD_ACTIVE30D_CACHE_KEY } });
  const v: unknown = row?.valueJson;
  if (!isRecord(v)) return null;
  if (!Array.isArray(v.perServer)) return null;
  if (typeof v.embyActive30dTotal !== "number") return null;
  const perServer = v.perServer.filter(isRecord).map((server) => ({
    id: typeof server.id === "string" ? server.id : "",
    name: typeof server.name === "string" ? server.name : "",
    active30d: typeof server.active30d === "number" ? server.active30d : 0,
    totalUsers: typeof server.totalUsers === "number" ? server.totalUsers : 0,
    ok: Boolean(server.ok),
    ...(typeof server.error === "string" ? { error: server.error } : {}),
  }));
  return {
    embyActive30dTotal: Number(v.embyActive30dTotal || 0),
    perServer,
    snapshotAt: typeof v.snapshotAt === "string" ? v.snapshotAt : null,
  } as ActiveSnapshot;
}

function serializeUserTrendSeries(series: UserTrendSeries[]): Prisma.InputJsonArray {
  return series.map((item) => ({
    id: item.id,
    name: item.name,
    data: item.data.map((point) => ({
      date: point.date,
      label: point.label,
      activeUsers: point.activeUsers,
      totalUsers: point.totalUsers,
    })),
  }));
}

function parseUserTrendSeries(v: unknown): UserTrendSeries[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isRecord).map((item) => {
    const data = Array.isArray(item.data)
      ? item.data.filter(isRecord).map((point) => ({
          date: typeof point.date === "string" ? point.date : "",
          label: typeof point.label === "string" ? point.label : "",
          activeUsers: typeof point.activeUsers === "number" ? point.activeUsers : 0,
          totalUsers: typeof point.totalUsers === "number" ? point.totalUsers : 0,
        }))
      : [];
    return {
      id: typeof item.id === "string" ? item.id : "",
      name: typeof item.name === "string" ? item.name : "",
      data,
    };
  });
}

async function readUserTrend30dSnapshot(): Promise<UserTrendSnapshot | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: DASHBOARD_USER_TREND_CACHE_KEY } });
  const v: unknown = row?.valueJson;
  if (!isRecord(v)) return null;
  const series = parseUserTrendSeries(v.series);
  if (!series.length) return null;
  return {
    series,
    snapshotAt: typeof v.snapshotAt === "string" ? v.snapshotAt : "",
  };
}

function startOfShanghaiDay(input: Date) {
  const shanghai = new Date(input.getTime() + SHANGHAI_OFFSET_MS);
  return new Date(Date.UTC(shanghai.getUTCFullYear(), shanghai.getUTCMonth(), shanghai.getUTCDate()) - SHANGHAI_OFFSET_MS);
}

function addDays(input: Date, days: number) {
  return new Date(input.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatShanghaiDateKey(input: Date) {
  const shanghai = new Date(input.getTime() + SHANGHAI_OFFSET_MS);
  const year = shanghai.getUTCFullYear();
  const month = String(shanghai.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shanghai.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShanghaiShortDate(input: Date) {
  const shanghai = new Date(input.getTime() + SHANGHAI_OFFSET_MS);
  return `${shanghai.getUTCMonth() + 1}/${shanghai.getUTCDate()}`;
}

function createActiveMap(days: Array<{ date: string }>) {
  const map = new Map<string, Set<string>>();
  for (const day of days) map.set(day.date, new Set());
  return map;
}

async function getUserTrend30d(): Promise<UserTrendSeries[]> {
  const todayStart = startOfShanghaiDay(new Date());
  const days = Array.from({ length: 30 }, (_, index) => {
    const start = addDays(todayStart, index - 29);
    return {
      start,
      end: addDays(start, 1),
      date: formatShanghaiDateKey(start),
      label: formatShanghaiShortDate(start),
    };
  });
  const firstStart = days[0].start;
  const lastEnd = days[days.length - 1].end;

  const [users, servers, links, playbackEvents] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { lt: lastEnd } },
      select: { id: true, username: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.embyServer.findMany({
      where: { enabled: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    prisma.embyUserLink.findMany({
      select: {
        userId: true,
        embyServerId: true,
        embyUserId: true,
        createdAt: true,
        user: { select: { username: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.playbackEvent.findMany({
      where: { occurredAt: { gte: firstStart, lt: lastEnd } },
      select: { embyServerId: true, embyUserId: true, userName: true, occurredAt: true },
    }),
  ]);

  const userIdByServerEmbyId = new Map<string, string>();
  const userIdByUsername = new Map<string, string>();
  const linksByServer = new Map<string, typeof links>();
  for (const user of users) userIdByUsername.set(user.username.toLowerCase(), user.id);
  for (const link of links) {
    userIdByServerEmbyId.set(`${link.embyServerId}:${link.embyUserId}`, link.userId);
    userIdByUsername.set(link.user.username.toLowerCase(), link.userId);
    const current = linksByServer.get(link.embyServerId) ?? [];
    current.push(link);
    linksByServer.set(link.embyServerId, current);
  }

  const allActiveByDate = createActiveMap(days);
  const activeByServerDate = new Map<string, Map<string, Set<string>>>();
  for (const server of servers) activeByServerDate.set(server.id, createActiveMap(days));

  for (const event of playbackEvents) {
    const userId =
      (event.embyUserId ? userIdByServerEmbyId.get(`${event.embyServerId}:${event.embyUserId}`) : null) ??
      (event.userName ? userIdByUsername.get(event.userName.toLowerCase()) : null);
    if (!userId) continue;
    const date = formatShanghaiDateKey(event.occurredAt);
    allActiveByDate.get(date)?.add(userId);
    activeByServerDate.get(event.embyServerId)?.get(date)?.add(userId);
  }

  let createdIndex = 0;
  const allData = days.map((day) => {
    while (createdIndex < users.length && users[createdIndex].createdAt < day.end) {
      createdIndex += 1;
    }
    return {
      date: day.date,
      label: day.label,
      activeUsers: allActiveByDate.get(day.date)?.size ?? 0,
      totalUsers: createdIndex,
    };
  });

  const series: UserTrendSeries[] = [{ id: "all", name: "全部服务器", data: allData }];
  for (const server of servers) {
    const serverLinks = linksByServer.get(server.id) ?? [];
    const serverActiveByDate = activeByServerDate.get(server.id) ?? createActiveMap(days);
    let linkIndex = 0;
    const seenUserIds = new Set<string>();
    const data = days.map((day) => {
      while (linkIndex < serverLinks.length && serverLinks[linkIndex].createdAt < day.end) {
        seenUserIds.add(serverLinks[linkIndex].userId);
        linkIndex += 1;
      }
      return {
        date: day.date,
        label: day.label,
        activeUsers: serverActiveByDate.get(day.date)?.size ?? 0,
        totalUsers: seenUserIds.size,
      };
    });
    series.push({ id: server.id, name: server.name, data });
  }

  return series;
}

export async function refreshUserTrend30dSnapshot(): Promise<UserTrendSnapshot> {
  const series = await getUserTrend30d();
  const snap: UserTrendSnapshot = { series, snapshotAt: new Date().toISOString() };
  const valueJson: Prisma.InputJsonObject = {
    series: serializeUserTrendSeries(series),
    snapshotAt: snap.snapshotAt,
  };
  await prisma.appSetting.upsert({
    where: { key: DASHBOARD_USER_TREND_CACHE_KEY },
    create: { key: DASHBOARD_USER_TREND_CACHE_KEY, valueJson },
    update: { valueJson },
  });
  return snap;
}

export async function getDashboardStats(expiringSoonDays = 7): Promise<DashboardStats> {
  const now = new Date();
  const soon = new Date(now.getTime() + expiringSoonDays * 24 * 60 * 60 * 1000);

  const [panelUserCount, expiringSoonCount, cached, userTrendCached] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({
      where: {
        status: "ACTIVE",
        endAt: { gt: now, lte: soon },
        user: { enabled: true },
      },
    }),
    readActive30dSnapshot(),
    readUserTrend30dSnapshot(),
  ]);

  const active = cached ?? (await refreshActive30dSnapshot());
  const userTrend = userTrendCached ?? (await readUserTrend30dSnapshot()) ?? (await refreshUserTrend30dSnapshot());

  return {
    panelUserCount,
    embyActive30dTotal: active.embyActive30dTotal,
    expiringSoonCount,
    expiringSoonDays,
    perServer: active.perServer,
    activeSnapshotAt: active.snapshotAt ?? null,
    userTrend30d: userTrend.series,
  };
}
