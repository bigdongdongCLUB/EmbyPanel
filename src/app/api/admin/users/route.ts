export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { hashPassword } from "@/lib/password";
import { passwordRuleErrorCode } from "@/lib/password-rules";
import { encryptSyncPassword } from "@/lib/user-secrets";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embySetUserDisabled } from "@/lib/emby-provision";
import { isSubscriptionExpiringSoon } from "@/lib/subscription-status";

const DEFAULT_MAX_CONCURRENT_PLAYBACKS = 1;

function hasEffectiveSubscriptionPlan(sub: { planId?: string | null; endAt?: Date | null } | null | undefined, now: Date) {
  return !!(sub?.planId && sub?.endAt && sub.endAt > now);
}

function shouldResetConcurrentPlaybackLimit(
  user: { maxConcurrentPlaybacks: number; maxConcurrentPlaybacksExpiresAt?: Date | null },
  sub: { planId?: string | null; endAt?: Date | null } | null | undefined,
  now: Date
) {
  if (user.maxConcurrentPlaybacks === DEFAULT_MAX_CONCURRENT_PLAYBACKS) return false;
  if (!hasEffectiveSubscriptionPlan(sub, now)) return true;
  if (!user.maxConcurrentPlaybacksExpiresAt) return true;
  return user.maxConcurrentPlaybacksExpiresAt <= now;
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const planId = (url.searchParams.get("planId") ?? "").trim();
  const subStatus = (url.searchParams.get("subStatus") ?? "").trim(); // valid|expiring|expired|none
  const sortBy = (url.searchParams.get("sortBy") ?? "createdAt").trim(); // createdAt|endAt
  const sortOrder = (url.searchParams.get("sortOrder") ?? "desc").trim() === "asc" ? "asc" : "desc";

  const now = new Date();

  const users = await prisma.user.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { username: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(planId
        ? {
            subscriptions: {
              some: {
                status: { in: ["ACTIVE", "EXPIRED"] },
                planId,
              },
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      enabled: true,
      maxConcurrentPlaybacks: true,
      maxConcurrentPlaybacksExpiresAt: true,
      balanceCents: true,
      expiryReminderEnabled: true,
      createdAt: true,
      embyLinks: {
        select: {
          id: true,
          embyUserId: true,
          disabled: true,
          createdAt: true,
          embyServer: { select: { id: true, name: true, baseUrl: true, externalUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true } },
        },
      },
      subscriptions: {
        where: { status: { in: ["ACTIVE", "EXPIRED"] } },
        orderBy: [{ endAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          status: true,
          startAt: true,
          endAt: true,
          planId: true,
          payCycle: true,
          plan: { select: { id: true, name: true, enabled: true, visible: true } },
          servers: { select: { embyServer: { select: { id: true, name: true, baseUrl: true, externalUrl: true } } } },
        },
      },
    },
  });

  // 修复：订阅已过期用户应在对应 Emby 服务器保持禁用
  for (const u of users as any[]) {
    const sub = u.subscriptions?.[0] as any;
    const isExpired = !!sub && sub.endAt <= now;
    if (!isExpired) continue;

    const links = (u.embyLinks ?? []).filter((l: any) => !l.disabled);
    for (const l of links) {
      try {
        const apiKey = getEmbyApiKeyForServer(l.embyServer);
        await embySetUserDisabled(l.embyServer.baseUrl, apiKey, l.embyUserId, true);
      } catch {}
      await prisma.embyUserLink.updateMany({ where: { id: l.id }, data: { disabled: true } });
      l.disabled = true;
    }
  }

  const usersNeedingConcurrencyReset = users.filter((u) => {
    const sub = u.subscriptions?.[0];
    return shouldResetConcurrentPlaybackLimit(u, sub, now);
  });
  if (usersNeedingConcurrencyReset.length) {
    await prisma.user.updateMany({
      where: { id: { in: usersNeedingConcurrencyReset.map((u) => u.id) } },
      data: { maxConcurrentPlaybacks: DEFAULT_MAX_CONCURRENT_PLAYBACKS, maxConcurrentPlaybacksExpiresAt: null },
    });
    for (const u of usersNeedingConcurrencyReset) {
      u.maxConcurrentPlaybacks = DEFAULT_MAX_CONCURRENT_PLAYBACKS;
      u.maxConcurrentPlaybacksExpiresAt = null;
    }
  }

  const mapped = users
    .map((u) => {
      const sub = u.subscriptions[0] as any;
      const subValid = sub && sub.endAt > now;
      const effectiveSubscriptionPlan = hasEffectiveSubscriptionPlan(sub, now);
      const effectiveConcurrencyLimit = !shouldResetConcurrentPlaybackLimit(u, sub, now);
      const expiringSoon = subValid && isSubscriptionExpiringSoon(sub.endAt, now);

      const statusLabel = sub ? (subValid ? (expiringSoon ? "即将到期" : "有效") : "已过期") : null;

      const linkByServerId = new Map((u.embyLinks ?? []).map((l: any) => [l.embyServer.id, l] as const));
      const assignedServers = (sub?.servers ?? []).map((x: any) => x.embyServer);
      const assignedByServerId = new Map(assignedServers.map((sv: any) => [sv.id, sv] as const));

      // 展示“所有历史已关联服务器（含禁用）” + “当前计划目标但因同名冲突未关联的服务器”
      const allServerIds = new Set<string>([
        ...Array.from(linkByServerId.keys()),
        ...Array.from(assignedByServerId.keys()),
      ]);

      const serverAllocations = Array.from(allServerIds).map((sid) => {
        const link = linkByServerId.get(sid) as any;
        const assigned = assignedByServerId.get(sid) as any;
        const sv = assigned ?? link?.embyServer;
        const status = link ? (link.disabled ? "DISABLED" : "ACTIVE") : "CONFLICT";
        return {
          embyServerId: sid,
          name: sv?.name ?? "-",
          baseUrl: sv?.externalUrl || sv?.baseUrl || "-",
          status,
          assignedAt: (link?.createdAt ?? sub?.startAt ?? u.createdAt)?.toISOString?.() ?? null,
        };
      });

      const activeCount = serverAllocations.filter((x: any) => x.status === "ACTIVE").length;
      const hasConflict = serverAllocations.some((x: any) => x.status === "CONFLICT");

      return {
        id: u.id,
        username: u.username,
        email: u.email,
        // panel admin, not emby admin
        role: u.role,
        enabled: u.enabled,
        maxConcurrentPlaybacks: effectiveSubscriptionPlan && effectiveConcurrencyLimit ? u.maxConcurrentPlaybacks : DEFAULT_MAX_CONCURRENT_PLAYBACKS,
        expiryReminderEnabled: u.expiryReminderEnabled,
        balance: u.balanceCents / 100,
        subscriptionStatus: statusLabel,
        isExpiringSoon: expiringSoon,
        planId: sub?.planId ?? null,
        planName: sub?.plan?.name ?? null,
        payCycle: sub?.payCycle ?? null,
        remark: null,
        servers: serverAllocations,
        serverCount: serverAllocations.length,
        serverOnlineCount: activeCount,
        serverHasConflict: hasConflict,
        endAt: sub?.endAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      };
    })
    .filter((row) => {
      if (!subStatus) return true;
      if (subStatus === "valid") return row.subscriptionStatus === "有效" || row.subscriptionStatus === "即将到期";
      if (subStatus === "expiring") return row.isExpiringSoon;
      if (subStatus === "expired") return row.subscriptionStatus === "已过期";
      if (subStatus === "none") return row.subscriptionStatus === null;
      return true;
    });

  mapped.sort((a, b) => {
    const av = sortBy === "endAt" ? (a.endAt ? new Date(a.endAt).getTime() : null) : (a.createdAt ? new Date(a.createdAt).getTime() : null);
    const bv = sortBy === "endAt" ? (b.endAt ? new Date(b.endAt).getTime() : null) : (b.createdAt ? new Date(b.createdAt).getTime() : null);

    const an = av === null || !Number.isFinite(av) ? null : av;
    const bn = bv === null || !Number.isFinite(bv) ? null : bv;

    if (an === null && bn === null) return 0;
    if (an === null) return 1;
    if (bn === null) return -1;
    return sortOrder === "asc" ? an - bn : bn - an;
  });

  return NextResponse.json({ ok: true, users: mapped });
}

const CreateSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum(["USER", "ADMIN"]).optional(),
  enabled: z.boolean().optional(),
  maxConcurrentPlaybacks: z.number().int().min(0).max(10).optional(),
  balanceCents: z.number().int().min(0).optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const exists = await prisma.user.findFirst({ where: { username: { equals: parsed.data.username.trim(), mode: "insensitive" } }, select: { id: true } });
  if (exists) return NextResponse.json({ error: "username_taken" }, { status: 409 });

  const securityRow = await prisma.appSetting.findUnique({ where: { key: "security_basic" } });
  const passwordError = passwordRuleErrorCode(parsed.data.password, !!((securityRow?.valueJson as any)?.strongPassword));
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const passwordHash = await hashPassword(parsed.data.password);

  let enc;
  try {
    enc = encryptSyncPassword(parsed.data.password);
  } catch (e: any) {
    return NextResponse.json({ error: "sync_password_encrypt_failed", detail: e?.message ?? String(e) }, { status: 500 });
  }

  const user = await prisma.user.create({
    data: {
      username: parsed.data.username,
      email: parsed.data.email ? parsed.data.email : null,
      passwordHash,
      syncPasswordEnc: enc.enc,
      syncPasswordIv: enc.iv,
      syncPasswordTag: enc.tag,
      role: (parsed.data.role as any) ?? "USER",
      enabled: parsed.data.enabled ?? true,
      maxConcurrentPlaybacks: DEFAULT_MAX_CONCURRENT_PLAYBACKS,
      maxConcurrentPlaybacksExpiresAt: null,
      expiryReminderEnabled: true,
      balanceCents: parsed.data.balanceCents ?? 0,
    },
    select: { id: true, username: true, email: true, role: true, enabled: true, maxConcurrentPlaybacks: true, maxConcurrentPlaybacksExpiresAt: true, balanceCents: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, user }, { status: 201 });
}
