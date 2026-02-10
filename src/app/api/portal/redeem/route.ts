export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const username = (session as any)?.username;
  const role = (session as any)?.role;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (role === "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

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
        const active = await tx.subscription.findFirst({
          where: { userId: user.id, status: "ACTIVE" },
          orderBy: { endAt: "desc" },
          select: { id: true, startAt: true, endAt: true },
        });

        if (!active) {
          const endAt = new Date(now.getTime() + days * 24 * 3600 * 1000);
          await tx.subscription.create({
            data: {
              userId: user.id,
              planId: card.planId ?? null,
              status: "ACTIVE",
              payCycle: card.payCycle ?? "MONTHLY",
              startAt: now,
              endAt,
            },
          });
          return { kind: "SUBSCRIPTION", daysAdded: days, endAt };
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
        return { kind: "SUBSCRIPTION", daysAdded: days, endAt: newEnd };
      }

      throw new Error("unsupported_card_type");
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
