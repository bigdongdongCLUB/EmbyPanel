import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchUsers } from "@/lib/emby";

export type DashboardStats = {
  panelUserCount: number;
  embyActive30dTotal: number;
  expiringSoonCount: number;
  expiringSoonDays: number;
  perServer: Array<{ id: string; name: string; active30d: number; totalUsers: number; ok: boolean; error?: string }>;
};

export async function getDashboardStats(expiringSoonDays = 7): Promise<DashboardStats> {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const soon = new Date(now.getTime() + expiringSoonDays * 24 * 60 * 60 * 1000);

  const [panelUserCount, expiringSoonCount, servers] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({
      where: {
        status: "ACTIVE",
        endAt: { gt: now, lte: soon },
        user: { enabled: true },
      },
    }),
    prisma.embyServer.findMany({
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
    }),
  ]);

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
    panelUserCount,
    embyActive30dTotal,
    expiringSoonCount,
    expiringSoonDays,
    perServer,
  };
}
