export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";
import { embySetUserDisabled } from "@/lib/emby-provision";
import { embyClearSimultaneousStreamLimit } from "@/lib/emby-user-policy";

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

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const recordId = String(id ?? "").trim();
  if (!recordId) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const [records, state] = await Promise.all([loadPenaltyRecords(), loadPenaltyState()]);
  const index = records.findIndex((r) => String(r?.id ?? "") === recordId);
  if (index < 0) return NextResponse.json({ error: "record_not_found" }, { status: 404 });

  const record = records[index] ?? {};
  const recordStatus = String(record.status ?? "");
  if (!["PENDING", "FAILED_UNBAN"].includes(recordStatus)) {
    return NextResponse.json({ error: "record_not_retriable", status: record.status ?? null }, { status: 409 });
  }

  const embyServerId = String(record.embyServerId ?? "").trim();
  const embyUserId = String(record.embyUserId ?? "").trim();
  const userId = String(record.userId ?? "").trim();
  if (!embyServerId || !embyUserId || !userId) {
    return NextResponse.json({ error: "record_data_invalid" }, { status: 400 });
  }

  const server = await prisma.embyServer.findUnique({
    where: { id: embyServerId },
    select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
  });
  if (!server) return NextResponse.json({ error: "server_not_found" }, { status: 404 });

  try {
    const apiKey = getEmbyApiKeyForServer(server as any);
    const rs = await embySetUserDisabled(server.baseUrl, apiKey, embyUserId, false);
    if (!rs?.ok) {
      return NextResponse.json(
        { error: "manual_unban_failed", message: String((rs as any)?.body || `HTTP ${(rs as any)?.status || "?"}`) },
        { status: 502 }
      );
    }

    const clearLimit = await embyClearSimultaneousStreamLimit(server.baseUrl, apiKey, embyUserId);

    await prisma.embyUserLink.updateMany({
      where: { userId, embyServerId, embyUserId },
      data: { disabled: false },
    });

    const nowIso = new Date().toISOString();
    records[index] = {
      ...record,
      status: "UNBANNED_MANUAL",
      unbannedAt: nowIso,
      unbanSource: "MANUAL",
      lastError: undefined,
      ...(clearLimit?.ok
        ? { unbanWarn: undefined }
        : { unbanWarn: `clear_stream_limit_failed: ${String((clearLimit as any)?.body || `HTTP ${(clearLimit as any)?.status || "?"}`)}` }),
    };

    const k = stateKey(embyServerId, userId);
    if (state[k]) {
      state[k] = {
        ...state[k],
        penaltyActive: false,
        consecutive: 0,
        lastUnbanAt: nowIso,
      };
    }

    await Promise.all([savePenaltyRecords(records), savePenaltyState(state)]);

    return NextResponse.json({ ok: true, record: records[index] });
  } catch (e: any) {
    return NextResponse.json({ error: "manual_unban_failed", message: String(e?.message ?? e) }, { status: 500 });
  }
}
