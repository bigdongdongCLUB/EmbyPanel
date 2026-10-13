import type { Prisma } from "@prisma/client";

export const DEFAULT_DAILY_VOD_SUBMISSIONS = 2;

export function dailyVodSubmissionSetting(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1000
    ? value : DEFAULT_DAILY_VOD_SUBMISSIONS;
}

export function vodSubmissionDay(now = new Date()) {
  const offset = 8 * 3600 * 1000;
  const local = new Date(now.getTime() + offset);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

export async function getDailyVodSubmissions(tx: Pick<Prisma.TransactionClient, "appSetting" | "vodPointEntry" | "vodRequest">, userId: string, now = new Date()) {
  const { start, end } = vodSubmissionDay(now);
  const [setting, entries, requests] = await Promise.all([
    tx.appSetting.findUnique({ where: { key: "vod_settings" } }),
    tx.vodPointEntry.findMany({ where: { userId, createdAt: { gte: start, lt: end } }, select: { requestId: true, dailySubmissionReleased: true } }),
    tx.vodRequest.findMany({ where: { userId, createdAt: { gte: start, lt: end } }, select: { id: true } }),
  ]);
  const settings = setting?.valueJson as { dailySubmissionLimit?: unknown } | null;
  const dailyTotal = dailyVodSubmissionSetting(settings?.dailySubmissionLimit);
  // Entries survive deletion; union with requests includes pre-points submissions without counting twice.
  const released = new Set(entries.filter((entry) => entry.dailySubmissionReleased).map((entry) => entry.requestId));
  const dailyUsed = new Set([...entries.map((entry) => entry.requestId), ...requests.map((request) => request.id)].filter((id) => !released.has(id))).size;
  return { dailyTotal, dailyUsed, dailyRemaining: Math.max(0, dailyTotal - dailyUsed), dailyNextReset: end.toISOString() };
}

export async function recordDeletedVodSubmission(tx: Prisma.TransactionClient, row: { id: string; userId: string; bizStatus: string; createdAt: Date }) {
  const local = new Date(row.createdAt.getTime() + 8 * 3600 * 1000);
  const month = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
  const dailySubmissionReleased = row.bizStatus === "PENDING";
  await tx.vodPointEntry.upsert({
    where: { requestId: row.id },
    update: { dailySubmissionReleased },
    create: { requestId: row.id, userId: row.userId, cost: 0, month, state: "RELEASED", createdAt: row.createdAt, dailySubmissionReleased },
  });
}
