export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { hashPassword } from "@/lib/password";
import { encryptSyncPassword, getSyncPassword } from "@/lib/user-secrets";
import { embyCreateUser, embyDeleteUser, embySetUserDisabled, embySetUserPassword } from "@/lib/emby-provision";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyFetchUsers } from "@/lib/emby";

const PatchSchema = z.object({
  email: z.string().email().nullable().optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  enabled: z.boolean().optional(),
  expiryReminderEnabled: z.boolean().optional(),
  balanceCents: z.number().int().min(0).optional(),

  changePassword: z.boolean().optional(),
  // allow empty string when not changing password (frontend may send it)
  newPassword: z
    .string()
    .transform((s) => s.trim())
    .optional()
    .refine((s) => s === undefined || s.length === 0 || s.length >= 6, "password_too_short"),

  subscription: z
    .object({
      planId: z.union([z.string().min(1), z.null()]).optional(),
      payCycle: z.enum(["TRIAL", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "TWO_YEARLY"]).nullable().optional(),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
    })
    .nullable()
    .optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      enabled: true,
      balanceCents: true,
      expiryReminderEnabled: true,
      createdAt: true,
      embyLinks: { select: { embyServerId: true, embyUserId: true, embyServer: { select: { name: true } } } },
      subscriptions: {
        where: { status: "ACTIVE" },
        orderBy: { endAt: "desc" },
        take: 1,
        select: {
          id: true,
          planId: true,
          payCycle: true,
          startAt: true,
          endAt: true,
          servers: { select: { embyServerId: true, embyServer: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [servers, plans] = await Promise.all([
    prisma.embyServer.findMany({ where: { enabled: true }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
    prisma.plan.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, visible: true, enabled: true } }),
  ]);

  return NextResponse.json({ ok: true, user, servers, plans });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!targetUser) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (parsed.data.role === "USER" && targetUser.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "cannot_demote_last_admin" }, { status: 400 });
    }
  }

  const data: any = {};
  if (parsed.data.email !== undefined) data.email = parsed.data.email;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
  if (parsed.data.expiryReminderEnabled !== undefined) data.expiryReminderEnabled = parsed.data.expiryReminderEnabled;
  if (parsed.data.balanceCents !== undefined) data.balanceCents = parsed.data.balanceCents;

  let newPlainPassword: string | null = null;
  if (parsed.data.changePassword) {
    const pw = parsed.data.newPassword ?? "";
    if (pw.length < 6) return NextResponse.json({ error: "password_too_short" }, { status: 400 });
    data.passwordHash = await hashPassword(pw);
    const enc = encryptSyncPassword(pw);
    data.syncPasswordEnc = enc.enc;
    data.syncPasswordIv = enc.iv;
    data.syncPasswordTag = enc.tag;
    newPlainPassword = pw;
  }

  const subscription = parsed.data.subscription;

  // snapshot previous assigned servers from current ACTIVE subscription
  const prevActive = await prisma.subscription.findFirst({
    where: { userId: id, status: "ACTIVE" },
    orderBy: { endAt: "desc" },
    select: { id: true, planId: true, servers: { select: { embyServerId: true } } },
  });
  const prevPlanId = prevActive?.planId ?? null;
  const prevServerIds = new Set((prevActive?.servers ?? []).map((x) => x.embyServerId));

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data });

    if (subscription !== undefined) {
      // Replace active subscription (simple MVP)
      await tx.subscription.updateMany({ where: { userId: id, status: "ACTIVE" }, data: { status: "CANCELED" } });

      if (subscription !== null) {
        const sub = await tx.subscription.create({
          data: {
            userId: id,
            planId: subscription.planId ?? null,
            status: "ACTIVE",
            payCycle: subscription.payCycle ?? null,
            startAt: new Date(subscription.startAt),
            endAt: new Date(subscription.endAt),
          },
        });

        // servers will be decided after commit (by plan strategy) and then persisted.
        // keep empty here.
      }
    }
  });

  // Provision/sync to Emby after commit (best-effort)
  // Decide next servers by plan.
  let nextServers: Array<{ embyServerId: string; templateEmbyUserId: string }> = [];
  const planChanged = subscription !== undefined && subscription !== null && (subscription.planId ?? null) !== prevPlanId;

  if (subscription && subscription.planId) {
    if (!planChanged) {
      // 仅改订阅时间时：沿用旧服务器映射，不重新挑服/不重复写入Emby用户
      nextServers = Array.from(prevServerIds).map((embyServerId) => ({ embyServerId, templateEmbyUserId: "" }));
    } else {
      try {
        const mod = await import("@/lib/plan-assign");
        const picked = await mod.pickServerForPlan(subscription.planId);
        nextServers = picked.servers;
      } catch (e) {
        // best-effort: if pick fails, keep nextServers empty (will result in only cancel/disable)
        nextServers = [];
      }
    }
  }

  const nextServerIds = new Set(nextServers.map((x) => x.embyServerId));
  const removedServerIds = [...prevServerIds].filter((sid) => !nextServerIds.has(sid));

  // 1) Disable on removed servers (unassign)
  if (removedServerIds.length) {
    const [links, servers] = await Promise.all([
      prisma.embyUserLink.findMany({ where: { userId: id, embyServerId: { in: removedServerIds } }, select: { embyServerId: true, embyUserId: true } }),
      prisma.embyServer.findMany({ where: { id: { in: removedServerIds } }, select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true } }),
    ]);
    const serverById = new Map(servers.map((s) => [s.id, s] as const));
    for (const l of links) {
      const s = serverById.get(l.embyServerId);
      if (!s) continue;
      const apiKey = getEmbyApiKeyForServer(s);
      await embySetUserDisabled(s.baseUrl, apiKey, l.embyUserId, true);
      await prisma.embyUserLink.updateMany({ where: { userId: id, embyServerId: l.embyServerId, embyUserId: l.embyUserId }, data: { disabled: true } });
    }
  }

  // 2) If panel user disabled, disable on all linked servers
  if (parsed.data.enabled === false) {
    const links = await prisma.embyUserLink.findMany({ where: { userId: id }, select: { embyServerId: true, embyUserId: true } });
    const servers = await prisma.embyServer.findMany({
      where: { id: { in: links.map((x) => x.embyServerId) } },
      select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
    });
    const serverById = new Map(servers.map((s) => [s.id, s] as const));
    for (const l of links) {
      const s = serverById.get(l.embyServerId);
      if (!s) continue;
      const apiKey = getEmbyApiKeyForServer(s);
      await embySetUserDisabled(s.baseUrl, apiKey, l.embyUserId, true);
      await prisma.embyUserLink.updateMany({ where: { userId: id, embyServerId: l.embyServerId, embyUserId: l.embyUserId }, data: { disabled: true } });
    }
  }

  // 3) If password changed, sync password to all currently linked Emby users (independent of plan changes)
  if (newPlainPassword) {
    const links = await prisma.embyUserLink.findMany({ where: { userId: id }, select: { embyServerId: true, embyUserId: true } });
    if (links.length) {
      const servers = await prisma.embyServer.findMany({
        where: { id: { in: links.map((x) => x.embyServerId) } },
        select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
      });
      const serverById = new Map(servers.map((s) => [s.id, s] as const));
      for (const l of links) {
        const s = serverById.get(l.embyServerId);
        if (!s) continue;
        const apiKey = getEmbyApiKeyForServer(s);
        await embySetUserPassword(s.baseUrl, apiKey, l.embyUserId, newPlainPassword);
      }
    }
  }

  // 3.5) 若订阅被调整为有效（手动调整/续费后），立即解除对应服务器上的禁用状态
  const subBecameValid = !!(subscription && new Date(subscription.endAt) > new Date());
  if (subBecameValid && nextServers.length) {
    const targetServerIds = new Set(nextServers.map((x) => x.embyServerId));
    const links = await prisma.embyUserLink.findMany({
      where: { userId: id, embyServerId: { in: Array.from(targetServerIds) } },
      select: { id: true, embyServerId: true, embyUserId: true },
    });
    if (links.length) {
      const servers = await prisma.embyServer.findMany({
        where: { id: { in: links.map((x) => x.embyServerId) } },
        select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
      });
      const serverById = new Map(servers.map((s) => [s.id, s] as const));
      for (const l of links) {
        const s = serverById.get(l.embyServerId);
        if (!s) continue;
        const apiKey = getEmbyApiKeyForServer(s);
        await embySetUserDisabled(s.baseUrl, apiKey, l.embyUserId, false);
        await prisma.embyUserLink.updateMany({ where: { id: l.id }, data: { disabled: false } });
      }
    }
  }

  // 4) Provision to newly assigned servers (by plan)
  const nameConflicts: Array<{ embyServerId: string; serverName: string; username: string }> = [];
  const shouldProvisionAssignedServers = !!(subscription && subscription.planId && planChanged);
  if (subscription && subscription.planId && nextServers.length) {
    const [user, servers, serverConfigs] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          username: true,
          syncPasswordEnc: true,
          syncPasswordIv: true,
          syncPasswordTag: true,
        },
      }),
      prisma.embyServer.findMany({
        where: { id: { in: nextServers.map((x) => x.embyServerId) } },
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
      prisma.planServerConfig.findMany({
        where: { planId: subscription.planId },
        select: { embyServerId: true, templateEmbyUserId: true },
      }),
    ]);

    const templateByServerId = new Map(serverConfigs.map((c) => [c.embyServerId, c.templateEmbyUserId] as const));

    if (user) {
      const fallbackPw = getSyncPassword(user);

      // persist subscription servers mapping
      const activeSub = await prisma.subscription.findFirst({ where: { userId: id, status: "ACTIVE" }, orderBy: { endAt: "desc" }, select: { id: true } });
      if (activeSub) {
        await prisma.subscriptionServer.deleteMany({ where: { subscriptionId: activeSub.id } });
        await prisma.subscriptionServer.createMany({
          data: nextServers.map((x) => ({ subscriptionId: activeSub.id, embyServerId: x.embyServerId })),
          skipDuplicates: true,
        });
      }

      if (shouldProvisionAssignedServers) {
        // provision
        const { embyApplyTemplatePolicy } = await import("@/lib/emby-provision");

        for (const s of servers) {
          const apiKey = getEmbyApiKeyForServer(s);

          // find emby user by name
          const usersRes = await embyFetchUsers(s.baseUrl, apiKey);
          let embyUserId: string | null = null;
          let existed = false;
          if (usersRes.ok) {
            const found = usersRes.users.find((u: any) => String(u?.Name ?? "").toLowerCase() === user.username.toLowerCase());
            if (found?.Id) {
              // 新逻辑：遇到同名用户不自动接管，标记冲突并跳过该服务器分配
              nameConflicts.push({ embyServerId: s.id, serverName: s.name, username: user.username });
              existed = true;
            }
          }

          if (!existed) {
            const created = await embyCreateUser(s.baseUrl, apiKey, user.username);
            if (created.ok) embyUserId = created.userId;
          }

          if (embyUserId) {
            // 仅在“修改密码”时同步到现有 Emby 账号；
            // 对新建的 Emby 账号，仍需设置一次密码以确保可登录。
            if (newPlainPassword) {
              await embySetUserPassword(s.baseUrl, apiKey, embyUserId, newPlainPassword);
            } else if (fallbackPw) {
              await embySetUserPassword(s.baseUrl, apiKey, embyUserId, fallbackPw);
            }

            const templateId = templateByServerId.get(s.id);
            if (templateId) {
              const applied = await embyApplyTemplatePolicy(s.baseUrl, apiKey, embyUserId, templateId);
              if (!applied.ok) {
                // best-effort, but keep a warning for debugging
                console.warn("template_policy_apply_failed", { userId: id, embyServerId: s.id, templateId, detail: applied });
              }
            }

            // ensure enabled on assignment
            await embySetUserDisabled(s.baseUrl, apiKey, embyUserId, false);

            await prisma.embyUserLink.upsert({
              where: { userId_embyServerId: { userId: user.id, embyServerId: s.id } },
              update: { embyUserId: embyUserId, disabled: false },
              create: { userId: user.id, embyServerId: s.id, embyUserId: embyUserId, disabled: false },
            });
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, nameConflicts, warn: nameConflicts.length ? "emby_name_conflict" : undefined });
}
