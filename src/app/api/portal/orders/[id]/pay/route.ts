export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pickServerForPlan } from "@/lib/plan-assign";
import { getSyncPassword } from "@/lib/user-secrets";
import { embyFetchUsers } from "@/lib/emby";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embyApplyTemplatePolicy, embyCreateUser, embySetUserDisabled, embySetUserPassword } from "@/lib/emby-provision";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const { id } = await ctx.params;

  let paidOrder: { id: string; planId: string; activeSubId: string };
  try {
    paidOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({ where: { id, userId: user.id } });
      if (!order) throw new Error("order_not_found");
      if (order.status !== "PENDING") throw new Error("order_not_pending");

      const me = await tx.user.findUnique({ where: { id: user.id }, select: { balanceCents: true } });
      if (!me) throw new Error("user_not_found");
      if ((me.balanceCents ?? 0) < order.amountCents) throw new Error("insufficient_balance");

      await tx.user.update({ where: { id: user.id }, data: { balanceCents: { decrement: order.amountCents } } });

      const now = new Date();
      const active = await tx.subscription.findFirst({
        where: { userId: user.id, status: "ACTIVE" },
        orderBy: { endAt: "desc" },
        select: { id: true, startAt: true, endAt: true },
      });

      let activeSubId = "";
      if (!active) {
        const endAt = new Date(now.getTime() + order.days * 24 * 3600 * 1000);
        const created = await tx.subscription.create({
          data: {
            userId: user.id,
            planId: order.planId,
            status: "ACTIVE",
            payCycle: order.payCycle,
            startAt: now,
            endAt,
          },
          select: { id: true },
        });
        activeSubId = created.id;
      } else {
        const base = active.endAt.getTime() > now.getTime() ? active.endAt : now;
        const newEnd = new Date(base.getTime() + order.days * 24 * 3600 * 1000);
        await tx.subscription.update({
          where: { id: active.id },
          data: {
            planId: order.planId,
            payCycle: order.payCycle,
            startAt: active.endAt.getTime() > now.getTime() ? active.startAt : now,
            endAt: newEnd,
            status: "ACTIVE",
          },
        });
        activeSubId = active.id;
      }

      await tx.serviceOrder.update({ where: { id: order.id }, data: { status: "PAID", paidAt: now } });

      return { id: order.id, planId: order.planId, activeSubId };
    });

    // 支付后同步分配 Emby 服务器与账号（best-effort）
    try {
      const [u, picked] = await Promise.all([
        prisma.user.findUnique({ where: { id: user.id }, select: { id: true, username: true, syncPasswordEnc: true, syncPasswordIv: true, syncPasswordTag: true } }),
        pickServerForPlan(paidOrder.planId),
      ]);

      if (!u) return NextResponse.json({ ok: true, warn: "user_not_found_after_paid" });

      const pw = getSyncPassword(u);
      if (!pw) return NextResponse.json({ ok: true, warn: "missing_sync_password" });

      const [servers, serverConfigs] = await Promise.all([
        prisma.embyServer.findMany({
          where: { id: { in: picked.servers.map((x) => x.embyServerId) } },
          select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
        }),
        prisma.planServerConfig.findMany({ where: { planId: paidOrder.planId }, select: { embyServerId: true, templateEmbyUserId: true } }),
      ]);

      const templateByServerId = new Map(serverConfigs.map((c) => [c.embyServerId, c.templateEmbyUserId] as const));

      for (const s of servers) {
        const apiKey = getEmbyApiKeyForServer(s);

        let embyUserId: string | null = null;
        const usersRes = await embyFetchUsers(s.baseUrl, apiKey);
        if (usersRes.ok) {
          const found = usersRes.users.find((x: any) => String(x?.Name ?? "").toLowerCase() === u.username.toLowerCase());
          if (found?.Id) embyUserId = String(found.Id);
        }

        if (!embyUserId) {
          const created = await embyCreateUser(s.baseUrl, apiKey, u.username);
          if (created.ok) embyUserId = created.userId;
        }
        if (!embyUserId) continue;

        await embySetUserPassword(s.baseUrl, apiKey, embyUserId, pw);
        const templateId = templateByServerId.get(s.id);
        if (templateId) await embyApplyTemplatePolicy(s.baseUrl, apiKey, embyUserId, templateId);
        await embySetUserDisabled(s.baseUrl, apiKey, embyUserId, false);

        await prisma.embyUserLink.upsert({
          where: { userId_embyServerId: { userId: u.id, embyServerId: s.id } },
          update: { embyUserId },
          create: { userId: u.id, embyServerId: s.id, embyUserId },
        });
      }

      await prisma.subscriptionServer.deleteMany({ where: { subscriptionId: paidOrder.activeSubId } });
      if (picked.servers.length) {
        await prisma.subscriptionServer.createMany({
          data: picked.servers.map((x) => ({ subscriptionId: paidOrder.activeSubId, embyServerId: x.embyServerId })),
          skipDuplicates: true,
        });
      }
    } catch (syncErr) {
      console.warn("order_paid_but_sync_failed", { orderId: paidOrder.id, userId: user.id, error: String(syncErr) });
      return NextResponse.json({ ok: true, warn: "order_paid_but_sync_failed" });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
