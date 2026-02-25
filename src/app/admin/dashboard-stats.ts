import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchUsers } from "@/lib/emby";

const DASHBOARD_ACTIVE30D_CACHE_KEY = "admin_dashboard_active30d_snapshot";

export type DashboardStats = {
  panelUserCount: number;
  embyActive30dTotal: number;
  expiringSoonCount: number;
  expiringSoonDays: number;
  perServer: Array<{ id: string; name: string; active30d: number; totalUsers: number; ok: boolean; error?: string }>;
  activeSnapshotAt: string | null;
};

type ActiveSnapshot = {
  embyActive30dTotal: number;
  perServer: DashboardStats["perServer"];
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
        const last = (u as any)?.LastActivityDate;
        if (!last) return false;
        const d = new Date(last);
        if (Number.isNaN(d.getTime())) return false;
        return d >= since;
      }).length;

      embyActive30dTotal += active30d;
      perServer.push({ id: s.id, name: s.name, active30d, totalUsers, ok: true });
    } catch (e: any) {
      perServer.push({ id: s.id, name: s.name, active30d: 0, totalUsers: 0, ok: false, error: e?.message ?? String(e) });
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
  await prisma.appSetting.upsert({
    where: { key: DASHBOARD_ACTIVE30D_CACHE_KEY },
    create: { key: DASHBOARD_ACTIVE30D_CACHE_KEY, valueJson: snap as any },
    update: { valueJson: snap as any },
  });
  return snap;
}

async function readActive30dSnapshot(): Promise<ActiveSnapshot | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: DASHBOARD_ACTIVE30D_CACHE_KEY } });
  const v = row?.valueJson as any;
  if (!v || typeof v !== "object") return null;
  if (!Array.isArray(v.perServer)) return null;
  if (typeof v.embyActive30dTotal !== "number") return null;
  return {
    embyActive30dTotal: Number(v.embyActive30dTotal || 0),
    perServer: v.perServer,
    snapshotAt: typeof v.snapshotAt === "string" ? v.snapshotAt : null,
  } as ActiveSnapshot;
}

export async function getDashboardStats(expiringSoonDays = 7): Promise<DashboardStats> {
  const now = new Date();
  const soon = new Date(now.getTime() + expiringSoonDays * 24 * 60 * 60 * 1000);

  const [panelUserCount, expiringSoonCount, cached] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({
      where: {
        status: "ACTIVE",
        endAt: { gt: now, lte: soon },
        user: { enabled: true },
      },
    }),
    readActive30dSnapshot(),
  ]);

  const active = cached ?? (await refreshActive30dSnapshot());

  return {
    panelUserCount,
    embyActive30dTotal: active.embyActive30dTotal,
    expiringSoonCount,
    expiringSoonDays,
    perServer: active.perServer,
    activeSnapshotAt: active.snapshotAt ?? null,
  };
}
