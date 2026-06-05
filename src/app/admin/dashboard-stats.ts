import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchUsers } from "@/lib/emby";
import { EXPIRING_SOON_DAYS, isSubscriptionExpiringSoon } from "@/lib/subscription-status";

const DASHBOARD_ACTIVE30D_CACHE_KEY = "admin_dashboard_active30d_snapshot";
// v4: both bars use the same Emby LastActivityDate snapshot family.
const DASHBOARD_USER_TREND_CACHE_KEY = "admin_dashboard_user_trend_30d_snapshot_v4";
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export type UserTrendPoint = {
  date: string;
  label: string;
  // Distinct users active on this completed day.
  activeUsers: number;
  // Same source as the top "all Emby servers active in 30 days" snapshot.
  active30dUsers: number;
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
  perServer: Array<{ id: string; name: string; active30d: number; dailyActive: number; totalUsers: number; ok: boolean; error?: string }>;
  activeSnapshotAt: string | null;
  userTrend30d: UserTrendSeries[];
};

type ActiveSnapshot = {
  embyActive30dTotal: number;
  embyDailyActiveTotal: number;
  perServer: DashboardStats["perServer"];
  snapshotAt: string | null;
};

type UserTrendSnapshot = {
  series: UserTrendSeries[];
  snapshotAt: string;
};

export async function buildActive30dSnapshot(): Promise<ActiveSnapshot> {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const todayStart = startOfShanghaiDay(now);
  const latestCompleteDayStart = addDays(todayStart, -1);
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
  let embyDailyActiveTotal = 0;
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
      const dailyActive = res.users.filter((u) => {
        const last = u.LastActivityDate;
        if (!last) return false;
        const d = new Date(last);
        if (Number.isNaN(d.getTime())) return false;
        return d >= latestCompleteDayStart && d < todayStart;
      }).length;

      embyActive30dTotal += active30d;
      embyDailyActiveTotal += dailyActive;
      perServer.push({ id: s.id, name: s.name, active30d, dailyActive, totalUsers, ok: true });
    } catch (e: unknown) {
      perServer.push({ id: s.id, name: s.name, active30d: 0, dailyActive: 0, totalUsers: 0, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    embyActive30dTotal,
    embyDailyActiveTotal,
    perServer,
    snapshotAt: now.toISOString(),
  };
}

export async function refreshActive30dSnapshot() {
  const snap = await buildActive30dSnapshot();
  const valueJson: Prisma.InputJsonObject = {
    embyActive30dTotal: snap.embyActive30dTotal,
    embyDailyActiveTotal: snap.embyDailyActiveTotal,
    perServer: snap.perServer.map((server) => ({
      id: server.id,
      name: server.name,
      active30d: server.active30d,
      dailyActive: server.dailyActive,
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
  await refreshUserTrend30dSnapshot(snap);
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
  if (typeof v.embyDailyActiveTotal !== "number") return null;
  if (!v.perServer.every((server) => isRecord(server) && "dailyActive" in server)) return null;
  const perServer = v.perServer.filter(isRecord).map((server) => ({
    id: typeof server.id === "string" ? server.id : "",
    name: typeof server.name === "string" ? server.name : "",
    active30d: typeof server.active30d === "number" ? server.active30d : 0,
    dailyActive: typeof server.dailyActive === "number" ? server.dailyActive : 0,
    totalUsers: typeof server.totalUsers === "number" ? server.totalUsers : 0,
    ok: Boolean(server.ok),
    ...(typeof server.error === "string" ? { error: server.error } : {}),
  }));
  return {
    embyActive30dTotal: Number(v.embyActive30dTotal || 0),
    embyDailyActiveTotal: v.embyDailyActiveTotal,
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
      active30dUsers: point.active30dUsers,
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
          active30dUsers: typeof point.active30dUsers === "number" ? point.active30dUsers : 0,
        }))
      : [];
    return {
      id: typeof item.id === "string" ? item.id : "",
      name: typeof item.name === "string" ? item.name : "",
      data,
    };
  });
}

// Old trend snapshots store different red-bar fields. Require the current field
// so a stale row cannot be served with the red bar silently 0 or wrong semantics.
function snapshotHasActive30dField(v: unknown): boolean {
  if (!isRecord(v) || !Array.isArray(v.series)) return false;
  return v.series.some(
    (item) =>
      isRecord(item) &&
      Array.isArray(item.data) &&
      item.data.some((point) => isRecord(point) && "active30dUsers" in point)
  );
}

async function readUserTrend30dSnapshot(): Promise<UserTrendSnapshot | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: DASHBOARD_USER_TREND_CACHE_KEY } });
  const v: unknown = row?.valueJson;
  if (!isRecord(v)) return null;
  if (!snapshotHasActive30dField(v)) return null;
  const series = parseUserTrendSeries(v.series);
  if (!series.length) return null;
  const expectedDays = getCompletedTrendDays();
  const expectedFirst = expectedDays[0]?.date;
  const expectedLast = expectedDays[expectedDays.length - 1]?.date;
  const allSeries = series.find((item) => item.id === "all") ?? series[0];
  const first = allSeries?.data[0]?.date;
  const last = allSeries?.data[allSeries.data.length - 1]?.date;
  if (first !== expectedFirst || last !== expectedLast) return null;
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

function getCompletedTrendDays() {
  const todayStart = startOfShanghaiDay(new Date());
  const latestCompleteDayStart = addDays(todayStart, -1);
  return Array.from({ length: 30 }, (_, index) => {
    const start = addDays(latestCompleteDayStart, index - 29);
    return {
      start,
      end: addDays(start, 1),
      date: formatShanghaiDateKey(start),
      label: formatShanghaiShortDate(start),
    };
  });
}

function createEmptyUserTrendSnapshot(): UserTrendSnapshot {
  return {
    series: [],
    snapshotAt: "",
  };
}

async function getStoredUserTrendSeries(): Promise<UserTrendSeries[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: DASHBOARD_USER_TREND_CACHE_KEY } });
  const v: unknown = row?.valueJson;
  if (!isRecord(v) || !snapshotHasActive30dField(v)) return [];
  return parseUserTrendSeries(v.series);
}

function createSnapshotTrendSkeleton(days: ReturnType<typeof getCompletedTrendDays>, active: ActiveSnapshot): UserTrendSeries[] {
  const allData = days.map((day) => ({
    date: day.date,
    label: day.label,
    activeUsers: 0,
    active30dUsers: 0,
  }));

  const series: UserTrendSeries[] = [{ id: "all", name: "全部服务器", data: allData }];
  for (const server of active.perServer) {
    const data = days.map((day) => ({
      date: day.date,
      label: day.label,
      activeUsers: 0,
      active30dUsers: 0,
    }));
    series.push({ id: server.id, name: server.name, data });
  }

  return series;
}


export async function refreshUserTrend30dSnapshot(activeSnapshot?: ActiveSnapshot): Promise<UserTrendSnapshot> {
  const days = getCompletedTrendDays();
  const latestDay = days[days.length - 1];
  const [previousSeries, active] = await Promise.all([
    getStoredUserTrendSeries(),
    activeSnapshot ? Promise.resolve(activeSnapshot) : buildActive30dSnapshot(),
  ]);
  const skeleton = createSnapshotTrendSkeleton(days, active);
  const previousDailyBySeriesAndDate = new Map<string, number>();
  const previousActive30dBySeriesAndDate = new Map<string, number>();
  for (const series of previousSeries) {
    for (const point of series.data) {
      previousDailyBySeriesAndDate.set(`${series.id}:${point.date}`, point.activeUsers);
      previousActive30dBySeriesAndDate.set(`${series.id}:${point.date}`, point.active30dUsers);
    }
  }
  const dailyActiveBySeriesId = new Map<string, number>([
    ["all", active.embyDailyActiveTotal],
    ...active.perServer.map((server) => [server.id, server.ok ? server.dailyActive : 0] as const),
  ]);
  const active30dBySeriesId = new Map<string, number>([
    ["all", active.embyActive30dTotal],
    ...active.perServer.map((server) => [server.id, server.ok ? server.active30d : 0] as const),
  ]);
  const series = skeleton.map((item) => ({
    ...item,
    data: item.data.map((point) => ({
      ...point,
      activeUsers:
        point.date === latestDay.date
          ? dailyActiveBySeriesId.get(item.id) ?? 0
          : previousDailyBySeriesAndDate.get(`${item.id}:${point.date}`) ?? 0,
      active30dUsers:
        point.date === latestDay.date
          ? active30dBySeriesId.get(item.id) ?? 0
          : previousActive30dBySeriesAndDate.get(`${item.id}:${point.date}`) ?? 0,
    })),
  }));
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

export async function getDashboardStats(expiringSoonDays = EXPIRING_SOON_DAYS): Promise<DashboardStats> {
  const now = new Date();

  const [panelUserCount, expiringUsers, cached, userTrendCached] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      where: { enabled: true },
      select: {
        subscriptions: {
          where: { status: { in: ["ACTIVE", "EXPIRED"] } },
          orderBy: [{ endAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { endAt: true },
        },
      },
    }),
    readActive30dSnapshot(),
    readUserTrend30dSnapshot(),
  ]);
  const expiringSoonCount = expiringUsers.filter((u) => isSubscriptionExpiringSoon(u.subscriptions[0]?.endAt, now, expiringSoonDays)).length;

  // Dashboard reads must not rebuild yesterday's LastActivityDate snapshot on page load.
  // If a cache is missing or stale, wait for the 01:00 scheduled job (or explicit job run)
  // so daily active and 30-day active stay on the same snapshot-time semantics.
  const active = cached ?? {
    embyActive30dTotal: 0,
    embyDailyActiveTotal: 0,
    perServer: [],
    snapshotAt: null,
  };
  const userTrend = userTrendCached ?? createEmptyUserTrendSnapshot();

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
