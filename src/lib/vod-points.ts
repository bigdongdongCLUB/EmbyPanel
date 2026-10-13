import type { Prisma } from "@prisma/client";

export const MONTHLY_VOD_POINTS = 300;

export function monthlyVodPointsSetting(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100000
    ? value : MONTHLY_VOD_POINTS;
}

export function vodPointCost(mediaType: "MOVIE" | "TV", year?: string | null) {
  if (mediaType === "MOVIE") return 10;
  const releaseYear = Number(year);
  if (!Number.isInteger(releaseYear) || releaseYear <= 0) return 30;
  return releaseYear >= 2015 ? 10 : releaseYear >= 2005 ? 20 : 30;
}

export function vodPointPeriod(now = new Date()) {
  const offset = 8 * 3600 * 1000;
  const local = new Date(now.getTime() + offset);
  const month = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
  const nextReset = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - offset);
  return { month, nextReset: nextReset.toISOString() };
}

export async function lockVodPointUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}

export async function getVodPoints(tx: Pick<Prisma.TransactionClient, "vodPointEntry" | "appSetting">, userId: string, now = new Date()) {
  const period = vodPointPeriod(now);
  const setting = await tx.appSetting.findUnique({ where: { key: "vod_settings" } });
  const settings = setting?.valueJson as { monthlyInitialPoints?: unknown } | null;
  const total = monthlyVodPointsSetting(settings?.monthlyInitialPoints);
  const sums = await tx.vodPointEntry.groupBy({
    by: ["state"],
    where: { userId, month: period.month, state: { in: ["RESERVED", "CHARGED"] } },
    _sum: { cost: true },
  });
  const charged = sums.find((sum) => sum.state === "CHARGED")?._sum.cost ?? 0;
  const reserved = sums.find((sum) => sum.state === "RESERVED")?._sum.cost ?? 0;
  return { ...period, total, charged, reserved, available: Math.max(0, total - charged - reserved) };
}

export async function settleVodPoints(tx: Prisma.TransactionClient, requestIds: string[], completed: boolean, pending: boolean, now = new Date(), targetBizStatus?: string) {
  const entries = await tx.vodPointEntry.findMany({ where: { requestId: { in: requestIds } }, orderBy: { userId: "asc" } });
  for (const userId of [...new Set(entries.map((entry) => entry.userId))]) await lockVodPointUser(tx, userId);
  // Read again after acquiring the locks: concurrent administrator actions may have settled these entries.
  const lockedEntries = await tx.vodPointEntry.findMany({ where: { requestId: { in: requestIds } } });
  const requests = targetBizStatus
    ? await tx.vodRequest.findMany({ where: { id: { in: requestIds } }, select: { id: true, bizStatus: true } })
    : [];
  const unchangedIds = new Set(requests.filter((request) => request.bizStatus === targetBizStatus).map((request) => request.id));
  const { month } = vodPointPeriod(now);
  for (const entry of lockedEntries) {
    if (entry.cost === 0) continue;
    // The submission month is fixed; later-month status changes never settle points.
    if (entry.month !== month) continue;
    if (unchangedIds.has(entry.requestId)) continue;
    if (completed && entry.state === "CHARGED") continue;
    const state = completed ? "CHARGED" : pending && entry.state !== "CHARGED" ? "RESERVED" : "RELEASED";
    if (state !== "RELEASED") {
      const balance = await getVodPoints(tx, entry.userId, now);
      const ownReservation = entry.month === month && entry.state === "RESERVED" ? entry.cost : 0;
      if (balance.total - balance.charged - balance.reserved + ownReservation < entry.cost) throw new Error("vod_points_insufficient");
    }
    await tx.vodPointEntry.update({
      where: { requestId: entry.requestId },
      data: { state },
    });
  }
}
