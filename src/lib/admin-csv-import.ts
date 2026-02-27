import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { encryptSyncPassword } from "@/lib/user-secrets";
import { embyCreateUser, embySetUserDisabled } from "@/lib/emby-provision";
import { embyFetchUsers } from "@/lib/emby";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";

const TEMPLATE_USERNAME = "atemplate";
export const CSV_IMPORT_MAX_ROWS = 1000;

export type CsvImportProgress = {
  total: number;
  processed: number;
  success: number;
  skipped: number;
  failed: number;
  message?: string;
};

export type CsvImportResult = {
  ok: true;
  success: number;
  skipped: number;
  failed: number;
  failures: Array<{ cell: string; username: string; reason: string }>;
};

function normalizePlanKey(v: string) {
  return String(v || "")
    .replace(/[\uFEFF\u200B\u200C\u200D\u00A0]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

function parseCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let inQuote = false;

  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      inQuote = !inQuote;
      i++;
      continue;
    }
    if (ch === "," && !inQuote) {
      out.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }

  out.push(cur.trim());
  return out;
}

function parseDateLike(s: string): Date | null {
  const raw0 = String(s || "").replace(/\u00A0/g, " ").trim();
  if (!raw0) return null;
  const raw = raw0.replace(/^'+/, "").split(/[ T]/)[0]; // 兼容 Excel 导出的日期时间与前置单引号
  const m = raw.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function validUsername(v: string) {
  const s = v.trim();
  if (!s) return false;
  if (s.length > 50) return false;
  if (s.toLowerCase() === TEMPLATE_USERNAME) return false;
  return true;
}

export async function runAdminCsvImport(
  params: { csv: string; fallbackPlanId?: string | null },
  onProgress?: (p: CsvImportProgress) => void,
): Promise<CsvImportResult> {
  const fallbackPlanId = params.fallbackPlanId ?? null;
  const rawLines = params.csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (rawLines.length <= 1) throw new Error("empty_csv");

  const lines = rawLines.slice(1);
  if (lines.length > CSV_IMPORT_MAX_ROWS) throw new Error(`too_many_rows:${CSV_IMPORT_MAX_ROWS}`);

  const total = lines.length;
  let processed = 0;
  let success = 0;
  let skipped = 0;
  let failed = 0;
  const failures: Array<{ cell: string; username: string; reason: string }> = [];

  const emit = (message?: string) => onProgress?.({ total, processed, success, skipped, failed, message });
  emit("开始导入...");

  const [plans, planConfigs, existingUsers] = await Promise.all([
    prisma.plan.findMany({ where: { enabled: true }, select: { id: true, name: true } }),
    prisma.planServerConfig.findMany({ select: { planId: true, embyServerId: true } }),
    prisma.user.findMany({ select: { username: true } }),
  ]);

  const planByName = new Map(plans.map((p) => [normalizePlanKey(p.name), p] as const));
  const serversByPlanId = new Map<string, string[]>();
  for (const cfg of planConfigs) {
    const arr = serversByPlanId.get(cfg.planId) ?? [];
    arr.push(cfg.embyServerId);
    serversByPlanId.set(cfg.planId, arr);
  }

  const existingPanelUsernames = new Set(existingUsers.map((u) => u.username.toLowerCase()));
  const allServerIds = Array.from(new Set(planConfigs.map((x) => x.embyServerId)));
  const embyServers = await prisma.embyServer.findMany({
    where: { id: { in: allServerIds }, enabled: true },
    select: { id: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
  });
  const serverById = new Map(embyServers.map((s) => [s.id, s] as const));

  for (let i = 0; i < lines.length; i++) {
    const rowNo = i + 2;
    const cell = `A${rowNo}`;
    const cols = parseCsvLine(lines[i]);

    const username = String(cols[0] ?? "").trim();
    const usernameKey = username.toLowerCase();
    const panelPassword = String(cols[1] ?? "").trim();
    const planName = String(cols[2] ?? "").trim();
    const startRaw = String(cols[3] ?? "").trim();
    const endRaw = String(cols[4] ?? "").trim();
    let createdUserId: string | null = null;

    try {
      if (!username) throw new Error("missing_username");
      if (!validUsername(username)) throw new Error("invalid_username");
      if (panelPassword.length < 6) throw new Error("password_too_short");

      if (existingPanelUsernames.has(usernameKey)) {
        skipped++;
        processed++;
        emit(`${cell} 跳过（已存在）`);
        continue;
      }

      const existsNow = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } }, select: { id: true } });
      if (existsNow) {
        existingPanelUsernames.add(usernameKey);
        skipped++;
        processed++;
        emit(`${cell} 跳过（已存在）`);
        continue;
      }

      let planId: string | null = null;
      let startAt: Date | null = null;
      let endAt: Date | null = null;
      let expiredOnImport = false;

      const csvPlan = planName ? planByName.get(normalizePlanKey(planName)) : null;
      const finalPlanId = csvPlan?.id ?? fallbackPlanId ?? null;
      if (finalPlanId) {
        const s = parseDateLike(startRaw);
        const e = parseDateLike(endRaw);
        if (s && e && s.getTime() < e.getTime()) {
          planId = finalPlanId;
          startAt = s;
          endAt = e;
          expiredOnImport = e.getTime() <= Date.now();
        }
      }

      const passwordHash = await hashPassword(panelPassword);
      const enc = encryptSyncPassword(panelPassword);

      const user = await prisma.user.create({
        data: {
          username,
          email: null,
          passwordHash,
          syncPasswordEnc: enc.enc,
          syncPasswordIv: enc.iv,
          syncPasswordTag: enc.tag,
          role: "USER",
          enabled: true,
        },
        select: { id: true },
      });
      createdUserId = user.id;
      existingPanelUsernames.add(usernameKey);

      if (planId && startAt && endAt) {
        const sub = await prisma.subscription.create({
          data: {
            userId: user.id,
            planId,
            status: expiredOnImport ? "EXPIRED" : "ACTIVE",
            payCycle: "YEARLY",
            startAt,
            endAt,
          },
          select: { id: true },
        });

        const targetServerIds = serversByPlanId.get(planId) ?? [];
        if (targetServerIds.length) {
          await prisma.subscriptionServer.createMany({
            data: targetServerIds.map((sid) => ({ subscriptionId: sub.id, embyServerId: sid })),
            skipDuplicates: true,
          });

          for (const sid of targetServerIds) {
            const server = serverById.get(sid);
            if (!server) continue;
            const apiKey = getEmbyApiKeyForServer(server);

            let embyUserId: string | null = null;
            const usersRes = await embyFetchUsers(server.baseUrl, apiKey);
            if (usersRes.ok) {
              const found = usersRes.users.find((u: any) => String(u?.Name ?? "").toLowerCase() === username.toLowerCase());
              if (found?.Id) embyUserId = String(found.Id);
            }

            if (!embyUserId) {
              const created = await embyCreateUser(server.baseUrl, apiKey, username);
              if (created.ok && created.userId) embyUserId = created.userId;
            }

            if (!embyUserId) {
              const retryRes = await embyFetchUsers(server.baseUrl, apiKey);
              if (retryRes.ok) {
                const retryFound = retryRes.users.find((u: any) => String(u?.Name ?? "").toLowerCase() === username.toLowerCase());
                if (retryFound?.Id) embyUserId = String(retryFound.Id);
              }
            }

            if (!embyUserId) throw new Error(`emby_link_failed:${sid}`);

            await prisma.embyUserLink.upsert({
              where: { userId_embyServerId: { userId: user.id, embyServerId: sid } },
              update: { embyUserId, disabled: expiredOnImport },
              create: { userId: user.id, embyServerId: sid, embyUserId, disabled: expiredOnImport },
            });
            await embySetUserDisabled(server.baseUrl, apiKey, embyUserId, expiredOnImport);
          }
        }
      }

      success++;
      processed++;
      emit(`${cell} 成功`);
    } catch (e: any) {
      if (createdUserId) {
        try {
          await prisma.user.delete({ where: { id: createdUserId } });
          existingPanelUsernames.delete(usernameKey);
        } catch {}
      }
      failed++;
      processed++;
      failures.push({ cell, username, reason: e?.message || "import_failed" });
      emit(`${cell} 失败：${e?.message || "import_failed"}`);
    }
  }

  emit("导入完成");
  return { ok: true, success, skipped, failed, failures };
}
