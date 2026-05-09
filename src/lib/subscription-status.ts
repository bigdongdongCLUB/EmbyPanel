export const EXPIRING_SOON_DAYS = 7;

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
