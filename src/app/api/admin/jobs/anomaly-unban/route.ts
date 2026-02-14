export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embySetUserDisabled } from "@/lib/emby-provision";

const PENALTY_STATE_KEY = "anomaly_penalty_state";
const PENALTY_RECORDS_KEY = "anomaly_penalty_records";

function stateKey(serverId: string, userId: string) {
  return `${serverId}:${userId}`;
}

async function loadPenaltyState() {
  const row = await prisma.appSetting.findUnique({ where: { key: PENALTY_STATE_KEY } });
  const v = row?.valueJson;
  if (!v || typeof v !== "object" || Array.isArray(v)) return {} as Record<string, any>;
  return v as Record<string, any>;
}

async function savePenaltyState(state: Record<string, any>) {
  await prisma.appSetting.upsert({
    where: { key: PENALTY_STATE_KEY },
    create: { key: PENALTY_STATE_KEY, valueJson: state },
    update: { valueJson: state },
  });
}

async function loadPenaltyRecords() {
  const row = await prisma.appSetting.findUnique({ where: { key: PENALTY_RECORDS_KEY } });
  return Array.isArray(row?.valueJson) ? (row!.valueJson as any[]) : [];
}

async function savePenaltyRecords(records: any[]) {
  await prisma.appSetting.upsert({
    where: { key: PENALTY_RECORDS_KEY },
    create: { key: PENALTY_RECORDS_KEY, valueJson: records },
    update: { valueJson: records },
  });
}

export async function POST(req: Request) {
  const internalSecret = (process.env.INTERNAL_JOBS_SECRET ?? "").trim();
  const headerInternalSecret = (req.headers.get("x-internal-jobs-secret") ?? "").trim();

  if (internalSecret && headerInternalSecret) {
    if (internalSecret !== headerInternalSecret) return NextResponse.json({ error: "invalid_internal_jobs_secret" }, { status: 401 });
  } else {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const now = new Date();
  const state = await loadPenaltyState();
  const records = await loadPenaltyRecords();

  let dueCount = 0;
  let unbanned = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of records) {
    if (!r || r.status !== "PENDING") continue;
    const unlockAt = new Date(String(r.unlockAt || ""));
    if (!Number.isFinite(unlockAt.getTime()) || unlockAt > now) continue;

    dueCount += 1;

    const user = await prisma.user.findUnique({
      where: { id: String(r.userId) },
      select: {
        id: true,
        enabled: true,
        subscriptions: {
          where: { status: "ACTIVE", endAt: { gt: now } },
          take: 1,
          select: { id: true },
        },
      },
    });

    const eligible = !!user?.enabled && !!user?.subscriptions?.length;
    if (!eligible) {
      r.status = "SKIPPED_NOT_ELIGIBLE";
      r.unbannedAt = now.toISOString();
      skipped += 1;
      const k = stateKey(String(r.embyServerId || ""), String(r.userId || ""));
      if (state[k]) state[k] = { ...state[k], penaltyActive: false, consecutive: 0, lastUnbanAt: now.toISOString() };
      continue;
    }

    const server = await prisma.embyServer.findUnique({
      where: { id: String(r.embyServerId) },
      select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
    });
    if (!server) {
      r.status = "FAILED_UNBAN";
      r.lastError = "server_not_found";
      failed += 1;
      continue;
    }

    try {
      const apiKey = getEmbyApiKeyForServer(server as any);
      const rs = await embySetUserDisabled(server.baseUrl, apiKey, String(r.embyUserId), false);
      if (!rs?.ok) {
        r.status = "FAILED_UNBAN";
        r.lastError = String((rs as any)?.body || `HTTP ${(rs as any)?.status || "?"}`);
        failed += 1;
        continue;
      }

      await prisma.embyUserLink.updateMany({
        where: { userId: String(r.userId), embyServerId: String(r.embyServerId), embyUserId: String(r.embyUserId) },
        data: { disabled: false },
      });

      r.status = "UNBANNED";
      r.unbannedAt = now.toISOString();
      unbanned += 1;
      const k = stateKey(String(r.embyServerId || ""), String(r.userId || ""));
      if (state[k]) state[k] = { ...state[k], penaltyActive: false, consecutive: 0, lastUnbanAt: now.toISOString() };
    } catch (e: any) {
      r.status = "FAILED_UNBAN";
      r.lastError = String(e?.message ?? e);
      failed += 1;
    }
  }

  await Promise.all([savePenaltyState(state), savePenaltyRecords(records)]);

  return NextResponse.json({ ok: true, dueCount, unbanned, skipped, failed });
}
