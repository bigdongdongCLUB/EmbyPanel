import { prisma } from "@/lib/db";

const LOGIN_RISK_KEY = "auth_login_risk_state";
const MAX_COOLDOWN_MINUTES = 60;
const FIRST_COOLDOWN_MINUTES = 5;
const FAILS_TO_TRIGGER = 5;
const STALE_KEEP_DAYS = 30;

type RiskEntry = {
  failCount: number;
  cooldownMinutes: number;
  lockUntil: number;
  updatedAt: number;
  lastFailureAt: number;
};

type RiskMap = Record<string, RiskEntry>;

function normalizeUsername(username: string) {
  return String(username || "").trim().toLowerCase();
}

function emptyEntry(now: number): RiskEntry {
  return {
    failCount: 0,
    cooldownMinutes: 0,
    lockUntil: 0,
    updatedAt: now,
    lastFailureAt: 0,
  };
}

function sanitizeEntry(input: any, now: number): RiskEntry {
  const e = emptyEntry(now);
  if (!input || typeof input !== "object" || Array.isArray(input)) return e;
  const failCount = Number(input.failCount || 0);
  const cooldownMinutes = Number(input.cooldownMinutes || 0);
  const lockUntil = Number(input.lockUntil || 0);
  const updatedAt = Number(input.updatedAt || now);
  const lastFailureAt = Number(input.lastFailureAt || 0);

  e.failCount = Number.isFinite(failCount) ? Math.max(0, Math.floor(failCount)) : 0;
  e.cooldownMinutes = Number.isFinite(cooldownMinutes) ? Math.max(0, Math.floor(cooldownMinutes)) : 0;
  e.lockUntil = Number.isFinite(lockUntil) ? Math.max(0, Math.floor(lockUntil)) : 0;
  e.updatedAt = Number.isFinite(updatedAt) ? Math.max(0, Math.floor(updatedAt)) : now;
  e.lastFailureAt = Number.isFinite(lastFailureAt) ? Math.max(0, Math.floor(lastFailureAt)) : 0;
  return e;
}

function cleanupState(map: RiskMap, now: number) {
  const staleBefore = now - STALE_KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(map)) {
    const updatedAt = Number(v?.updatedAt || 0);
    if (updatedAt > 0 && updatedAt < staleBefore) delete map[k];
  }
}

async function loadState(now: number): Promise<RiskMap> {
  const row = await prisma.appSetting.findUnique({ where: { key: LOGIN_RISK_KEY } });
  const raw = row?.valueJson;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: RiskMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, any>)) {
    out[k] = sanitizeEntry(v, now);
  }
  cleanupState(out, now);
  return out;
}

async function saveState(map: RiskMap) {
  await prisma.appSetting.upsert({
    where: { key: LOGIN_RISK_KEY },
    create: { key: LOGIN_RISK_KEY, valueJson: map },
    update: { valueJson: map },
  });
}

function isLocked(entry: RiskEntry, now: number) {
  return Number(entry.lockUntil || 0) > now;
}

function lockRemainingSeconds(entry: RiskEntry, now: number) {
  const ms = Number(entry.lockUntil || 0) - now;
  if (ms <= 0) return 0;
  return Math.ceil(ms / 1000);
}

export async function getLoginRiskStatus(usernameRaw: string) {
  const username = normalizeUsername(usernameRaw);
  if (!username) return { locked: false, remainingSeconds: 0, cooldownMinutes: 0 };

  const now = Date.now();
  const map = await loadState(now);
  const entry = map[username] || emptyEntry(now);

  if (!isLocked(entry, now)) return { locked: false, remainingSeconds: 0, cooldownMinutes: entry.cooldownMinutes || 0 };

  return {
    locked: true,
    remainingSeconds: lockRemainingSeconds(entry, now),
    cooldownMinutes: Number(entry.cooldownMinutes || 0),
  };
}

export async function clearLoginRiskOnSuccess(usernameRaw: string) {
  const username = normalizeUsername(usernameRaw);
  if (!username) return;

  const now = Date.now();
  const map = await loadState(now);
  if (!map[username]) return;

  delete map[username];
  cleanupState(map, now);
  await saveState(map);
}

export async function recordLoginFailure(usernameRaw: string) {
  const username = normalizeUsername(usernameRaw);
  if (!username) return { locked: false, remainingSeconds: 0, cooldownMinutes: 0 };

  const now = Date.now();
  const map = await loadState(now);
  const entry = map[username] || emptyEntry(now);

  // Already in cooldown: keep locked state.
  if (isLocked(entry, now)) {
    entry.updatedAt = now;
    map[username] = entry;
    cleanupState(map, now);
    await saveState(map);
    return {
      locked: true,
      remainingSeconds: lockRemainingSeconds(entry, now),
      cooldownMinutes: Number(entry.cooldownMinutes || 0),
    };
  }

  const hadCooldownBefore = Number(entry.cooldownMinutes || 0) > 0 && Number(entry.lockUntil || 0) > 0 && Number(entry.lockUntil || 0) <= now;

  if (hadCooldownBefore) {
    const nextCooldown = Math.min(MAX_COOLDOWN_MINUTES, Math.max(FIRST_COOLDOWN_MINUTES, Number(entry.cooldownMinutes || 0) * 2));
    entry.cooldownMinutes = nextCooldown;
    entry.lockUntil = now + nextCooldown * 60 * 1000;
    entry.failCount = 0;
    entry.lastFailureAt = now;
    entry.updatedAt = now;

    map[username] = entry;
    cleanupState(map, now);
    await saveState(map);

    return {
      locked: true,
      remainingSeconds: lockRemainingSeconds(entry, now),
      cooldownMinutes: nextCooldown,
    };
  }

  entry.failCount = Number(entry.failCount || 0) + 1;
  entry.lastFailureAt = now;
  entry.updatedAt = now;

  if (entry.failCount >= FAILS_TO_TRIGGER) {
    const nextCooldown = entry.cooldownMinutes > 0 ? Math.min(MAX_COOLDOWN_MINUTES, entry.cooldownMinutes * 2) : FIRST_COOLDOWN_MINUTES;
    entry.cooldownMinutes = nextCooldown;
    entry.lockUntil = now + nextCooldown * 60 * 1000;
    entry.failCount = 0;
  }

  map[username] = entry;
  cleanupState(map, now);
  await saveState(map);

  return {
    locked: isLocked(entry, now),
    remainingSeconds: lockRemainingSeconds(entry, now),
    cooldownMinutes: Number(entry.cooldownMinutes || 0),
  };
}
