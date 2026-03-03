export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pickServerForPlan } from "@/lib/plan-assign";
import { getSyncPassword } from "@/lib/user-secrets";
import { embyFetchUsers } from "@/lib/emby";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyApplyTemplatePolicy, embyCreateUser, embySetUserDisabled, embySetUserPassword } from "@/lib/emby-provision";

const INVITE_REBATE_KEY = "invite_rebate";
const INVITE_REL_KEY = "invite_relations";
const INVITE_FIRST_PAID_KEY = "invite_rebate_first_paid";

async function applyInviteCommission(tx: any, buyerUserId: string, amountCents: number) {
  if (!amountCents || amountCents <= 0) return;

  const [rebateRow, relRow] = await Promise.all([
    tx.appSetting.findUnique({ where: { key: INVITE_REBATE_KEY } }),
    tx.appSetting.findUnique({ where: { key: INVITE_REL_KEY } }),
  ]);

  const rebate = (rebateRow?.valueJson as any) ?? {};
  if (!rebate?.enabled) return;

  const relMap = ((relRow?.valueJson as any) ?? {}) as Record<string, { inviterUserId: string }>;
  const inviterUserId = relMap[buyerUserId]?.inviterUserId;
  if (!inviterUserId || inviterUserId === buyerUserId) return;

  const rate1 = Number(rebate?.rate1 ?? 0);
  if (!Number.isFinite(rate1) || rate1 <= 0) return;

  const mode = rebate?.mode === "FIRST_ONLY" ? "FIRST_ONLY" : "LOOP";
  if (mode === "FIRST_ONLY") {
    const firstPaidRow = await tx.appSetting.findUnique({ where: { key: INVITE_FIRST_PAID_KEY } });
    const paidMap = ((firstPaidRow?.valueJson as any) ?? {}) as Record<string, boolean>;
    if (paidMap[buyerUserId]) return;

    paidMap[buyerUserId] = true;
    await tx.appSetting.upsert({
      where: { key: INVITE_FIRST_PAID_KEY },
      create: { key: INVITE_FIRST_PAID_KEY, valueJson: paidMap },
      update: { valueJson: paidMap },
    });
  }

  const commissionCents = Math.floor((amountCents * rate1) / 100);
  if (commissionCents <= 0) return;

  await tx.user.update({ where: { id: inviterUserId }, data: { balanceCents: { increment: commissionCents } } });

  const recKey = "invite_rebate_records";
  const recRow = await tx.appSetting.findUnique({ where: { key: recKey } });
  const records = Array.isArray(recRow?.valueJson) ? ([...(recRow!.valueJson as any[])] as any[]) : [];
  records.push({
    id: crypto.randomUUID(),
    inviterUserId,
    invitedUserId: buyerUserId,
    level: 1,
    rate: rate1,
    orderAmountCents: amountCents,
    rebateAmountCents: commissionCents,
    createdAt: new Date().toISOString(),
    source: "CARD_REDEEM",
  });
  if (records.length > 5000) records.splice(0, records.length - 5000);

  await tx.appSetting.upsert({
    where: { key: recKey },
    create: { key: recKey, valueJson: records },
    update: { valueJson: records },
  });
}

function getPlanPriceCents(pricingJson: any, payCycle?: string | null): number {
  const keyMap: Record<string, string> = {
    TRIAL: "trial",
    MONTHLY: "monthly",
    QUARTERLY: "quarterly",
    HALF_YEARLY: "halfYearly",
    YEARLY: "yearly",
    TWO_YEARLY: "twoYearly",
  };
  const key = keyMap[String(payCycle || "MONTHLY")] || "monthly";
  const raw = pricingJson?.[key]?.priceCents;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

const BodySchema = z.object({ code: z.string().trim().min(6).max(64) });

function cycleDays(payCycle?: string | null) {
  switch (payCycle) {
    case "TRIAL":
      return 7;
    case "MONTHLY":
      return 30;
    case "QUARTERLY":
      return 90;
    case "HALF_YEARLY":
      return 180;
    case "YEARLY":
      return 365;
    case "TWO_YEARLY":
      return 730;
    default:
      return 30;
  }
}


function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findEmbyUserIdByUsername(baseUrl: string, apiKey: string, username: string) {
  try {
    const usersRes = await embyFetchUsers(baseUrl, apiKey);
    if (!usersRes.ok) return null;
    const found = usersRes.users.find((x: any) => String(x?.Name ?? "").toLowerCase() === username.toLowerCase());
    return found?.Id ? String(found.Id) : null;
  } catch {
    return null;
  }
}

async function ensureEmbyUserId(baseUrl: string, apiKey: string, username: string) {
  const backoffMs = [0, 300, 800];

  for (let i = 0; i < backoffMs.length; i += 1) {
    const existing = await findEmbyUserIdByUsername(baseUrl, apiKey, username);
    if (existing) return existing;

    try {
      const created = await embyCreateUser(baseUrl, apiKey, username);
      if (created.ok && created.userId) return created.userId;
    } catch {
      // ignore and retry by re-querying user list
    }

    // 某些高负载情况下，创建可能已成功但响应失败，二次查询兜底
    const createdBySideEffect = await findEmbyUserIdByUsername(baseUrl, apiKey, username);
    if (createdBySideEffect) return createdBySideEffect;

    if (i < backoffMs.length - 1) {
      await sleep(backoffMs[i + 1]);
    }
  }

  return null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const code = parsed.data.code.toUpperCase();

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const cardModel: any = (tx as any).cardCode;
      const card = cardModel
        ? await cardModel.findUnique({ where: { code } })
        : (await tx.$queryRaw<any[]>`SELECT * FROM "CardCode" WHERE "code"=${code} LIMIT 1`)[0];

      if (!card) throw new Error("card_not_found");
      if (card.status !== "UNUSED") throw new Error("card_not_usable");

      // lock by status update
      let locked = 0;
      if (cardModel) {
        const r = await cardModel.updateMany({
          where: { id: card.id, status: "UNUSED" },
          data: { status: "USED", usedAt: new Date(), usedByUserId: user.id },
        });
        locked = r.count;
      } else {
        const r = await tx.$executeRaw`UPDATE "CardCode" SET "status"='USED'::"CardCodeStatus", "usedAt"=NOW(), "usedByUserId"=${user.id} WHERE "id"=${card.id} AND "status"='UNUSED'::"CardCodeStatus"`;
        locked = Number(r || 0);
      }
      if (!locked) throw new Error("card_already_used");

      if (card.type === "BALANCE") {
        const amount = Number(card.amountCents ?? 0);
        if (amount <= 0) throw new Error("invalid_balance_card");
        await tx.user.update({ where: { id: user.id }, data: { balanceCents: { increment: amount } } });
        return { kind: "BALANCE", amountCents: amount };
      }

      if (card.type === "SUBSCRIPTION") {
        const days = Number(card.subscriptionDays ?? 0) > 0 ? Number(card.subscriptionDays) : cycleDays(card.payCycle);
        const now = new Date();

        let planPriceCents = 0;
        if (card.planId) {
          const plan = await tx.plan.findUnique({ where: { id: card.planId }, select: { pricingJson: true } });
          planPriceCents = getPlanPriceCents((plan as any)?.pricingJson, card.payCycle);
        }
        const active = await tx.subscription.findFirst({
          where: { userId: user.id, status: "ACTIVE" },
          orderBy: { endAt: "desc" },
          select: { id: true, startAt: true, endAt: true },
        });

        if (!active) {
          const endAt = new Date(now.getTime() + days * 24 * 3600 * 1000);
          const created = await tx.subscription.create({
            data: {
              userId: user.id,
              planId: card.planId ?? null,
              status: "ACTIVE",
              payCycle: card.payCycle ?? "MONTHLY",
              startAt: now,
              endAt,
            },
            select: { id: true },
          });
          await applyInviteCommission(tx, user.id, planPriceCents);
          return { kind: "SUBSCRIPTION", daysAdded: days, endAt, planId: card.planId ?? null, subscriptionId: created.id };
        }

        const base = active.endAt.getTime() > now.getTime() ? active.endAt : now;
        const newEnd = new Date(base.getTime() + days * 24 * 3600 * 1000);
        await tx.subscription.update({
          where: { id: active.id },
          data: {
            planId: card.planId ?? null,
            payCycle: card.payCycle ?? "MONTHLY",
            startAt: active.endAt.getTime() > now.getTime() ? active.startAt : now,
            endAt: newEnd,
            status: "ACTIVE",
          },
        });
        await applyInviteCommission(tx, user.id, planPriceCents);
        return { kind: "SUBSCRIPTION", daysAdded: days, endAt: newEnd, planId: card.planId ?? null, subscriptionId: active.id };
      }

      throw new Error("unsupported_card_type");
    });

    let syncWarn: string | null = null;

    if (result?.kind === "SUBSCRIPTION" && result?.planId && result?.subscriptionId) {
      try {
        const [u, picked] = await Promise.all([
          prisma.user.findUnique({ where: { id: user.id }, select: { id: true, username: true, syncPasswordEnc: true, syncPasswordIv: true, syncPasswordTag: true } }),
          pickServerForPlan(result.planId),
        ]);

        if (!u) {
          syncWarn = "user_not_found_after_redeem";
        } else {
          const [servers, serverConfigs] = await Promise.all([
            prisma.embyServer.findMany({
              where: { id: { in: picked.servers.map((x) => x.embyServerId) } },
              select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
            }),
            prisma.planServerConfig.findMany({ where: { planId: result.planId }, select: { embyServerId: true, templateEmbyUserId: true } }),
          ]);

          // 先写订阅-服务器关联，避免后续某个远端接口波动导致本地 link 丢失
          await prisma.subscriptionServer.deleteMany({ where: { subscriptionId: result.subscriptionId } });
          if (picked.servers.length) {
            await prisma.subscriptionServer.createMany({
              data: picked.servers.map((x) => ({ subscriptionId: result.subscriptionId, embyServerId: x.embyServerId })),
              skipDuplicates: true,
            });
          }

          const templateByServerId = new Map(serverConfigs.map((c) => [c.embyServerId, c.templateEmbyUserId] as const));
          const pw = getSyncPassword(u);
          const syncIssues: string[] = [];

          for (const s of servers) {
            const apiKey = getEmbyApiKeyForServer(s);
            const embyUserId = await ensureEmbyUserId(s.baseUrl, apiKey, u.username);

            if (!embyUserId) {
              syncIssues.push(`${s.id}:resolve_user_failed`);
              continue;
            }

            // 只要拿到 Emby userId，立即 upsert link，降低“远端已创建但本地未关联”的概率
            await prisma.embyUserLink.upsert({
              where: { userId_embyServerId: { userId: u.id, embyServerId: s.id } },
              update: { embyUserId },
              create: { userId: u.id, embyServerId: s.id, embyUserId },
            });

            if (!pw) {
              syncIssues.push(`${s.id}:missing_sync_password`);
              continue;
            }

            try {
              const r = await embySetUserPassword(s.baseUrl, apiKey, embyUserId, pw);
              if (!r.ok) syncIssues.push(`${s.id}:set_password_failed`);
            } catch {
              syncIssues.push(`${s.id}:set_password_failed`);
            }

            const templateId = templateByServerId.get(s.id);
            if (templateId) {
              try {
                const r = await embyApplyTemplatePolicy(s.baseUrl, apiKey, embyUserId, templateId);
                if (!r.ok) syncIssues.push(`${s.id}:apply_template_failed`);
              } catch {
                syncIssues.push(`${s.id}:apply_template_failed`);
              }
            }

            try {
              const r = await embySetUserDisabled(s.baseUrl, apiKey, embyUserId, false);
              if (!r.ok) syncIssues.push(`${s.id}:enable_user_failed`);
            } catch {
              syncIssues.push(`${s.id}:enable_user_failed`);
            }
          }

          if (syncIssues.length) {
            syncWarn = "redeem_subscription_sync_partial";
            console.warn("redeem_subscription_sync_partial", {
              userId: user.id,
              planId: result.planId,
              subscriptionId: result.subscriptionId,
              issues: syncIssues,
            });
          }
        }
      } catch (syncErr) {
        console.warn("redeem_subscription_sync_failed", { userId: user.id, planId: result.planId, error: String(syncErr) });
        return NextResponse.json({ ok: true, result, warn: "redeem_subscription_sync_failed" });
      }
    }

    return NextResponse.json(syncWarn ? { ok: true, result, warn: syncWarn } : { ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
