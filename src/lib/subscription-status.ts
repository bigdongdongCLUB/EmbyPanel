export const EXPIRING_SOON_DAYS = 7;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getExpiringSoonCutoff(now = new Date(), days = EXPIRING_SOON_DAYS) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isSubscriptionExpiringSoon(endAt: Date | string | null | undefined, now = new Date(), days = EXPIRING_SOON_DAYS) {
  if (!endAt) return false;
  const end = endAt instanceof Date ? endAt : new Date(endAt);
  const endMs = end.getTime();
  if (!Number.isFinite(endMs)) return false;
  return endMs > now.getTime() && endMs <= getExpiringSoonCutoff(now, days).getTime();
}

export function isSubscriptionExpiringThisMonth(endAt: Date | string | null | undefined, now = new Date()) {
  if (!endAt) return false;
  const end = endAt instanceof Date ? endAt : new Date(endAt);
  const endMs = end.getTime();
  if (!Number.isFinite(endMs)) return false;

  const shanghaiNow = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const nextMonthStart =
    Date.UTC(shanghaiNow.getUTCFullYear(), shanghaiNow.getUTCMonth() + 1, 1) - SHANGHAI_OFFSET_MS;
  return endMs > now.getTime() && endMs < nextMonthStart;
}
