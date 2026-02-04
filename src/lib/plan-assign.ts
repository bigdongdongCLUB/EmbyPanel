import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchUsers } from "@/lib/emby";

export async function pickServerForPlan(planId: string) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      serverAssignStrategy: true,
      serverConfigs: {
        select: {
          embyServerId: true,
          templateEmbyUserId: true,
          embyServer: { select: { id: true, name: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true, enabled: true } },
        },
      },
    },
  });

  if (!plan) throw new Error("plan_not_found");
  const configs = (plan.serverConfigs ?? []).filter((c) => c.embyServer.enabled);
  if (!configs.length) throw new Error("plan_has_no_enabled_servers");

  if (plan.serverAssignStrategy === "ALL") {
    return {
      strategy: "ALL" as const,
      servers: configs.map((c) => ({
        embyServerId: c.embyServerId,
        templateEmbyUserId: c.templateEmbyUserId,
      })),
    };
  }

  // LOAD_BALANCE: choose server with minimal existing user count
  const scored: Array<{ embyServerId: string; templateEmbyUserId: string; userCount: number }> = [];

  for (const c of configs) {
    const apiKey = getEmbyApiKeyForServer(c.embyServer);
    const usersRes = await embyFetchUsers(c.embyServer.baseUrl, apiKey);
    if (!usersRes.ok) continue;

    const count = (usersRes.users ?? []).length;
    scored.push({ embyServerId: c.embyServerId, templateEmbyUserId: c.templateEmbyUserId, userCount: count });
  }

  if (!scored.length) throw new Error("all_servers_fetch_users_failed");

  scored.sort((a, b) => a.userCount - b.userCount);
  const best = scored[0];

  return {
    strategy: "LOAD_BALANCE" as const,
    servers: [{ embyServerId: best.embyServerId, templateEmbyUserId: best.templateEmbyUserId }],
    debug: scored,
  };
}
