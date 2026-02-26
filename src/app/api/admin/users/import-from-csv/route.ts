export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { encryptSyncPassword } from "@/lib/user-secrets";
import { embyCreateUser, embySetUserDisabled } from "@/lib/emby-provision";
import { embyFetchUsers } from "@/lib/emby";
import { getEmbyApiKeyForServer } from "@/lib/emby-auth";

const TEMPLATE_USERNAME = "atemplate";
const MAX_ROWS = 1000;

const Schema = z.object({
  csv: z.string().min(1),
});

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
  const raw = String(s || "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
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
  if (s.length < 5 || s.length > 24) return false;
  if (!/^[a-zA-Z0-9]+$/.test(s)) return false;
  if (/^[0-9]+$/.test(s)) return false;
  if (s.toLowerCase() === TEMPLATE_USERNAME) return false;
  return true;
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 400 });

  const rawLines = parsed.data.csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (rawLines.length <= 1) return NextResponse.json({ error: "empty_csv" }, { status: 400 });

  const lines = rawLines.slice(1); // skip header
  if (lines.length > MAX_ROWS) {
    return NextResponse.json({ error: "too_many_rows", max: MAX_ROWS }, { status: 400 });
  }

  const [plans, planConfigs, existingUsers] = await Promise.all([
    prisma.plan.findMany({ where: { enabled: true }, select: { id: true, name: true } }),
    prisma.planServerConfig.findMany({ select: { planId: true, embyServerId: true } }),
    prisma.user.findMany({ select: { username: true } }),
  ]);

  const planByName = new Map(plans.map((p) => [p.name.trim().toLowerCase(), p] as const));
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
    select: { id: true, name: true, baseUrl: true, apiKey: true, apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
  });
  const serverById = new Map(embyServers.map((s) => [s.id, s] as const));

  // cache server user list by server id
  const embyUsersCache = new Map<string, any>();

  let success = 0;
  let skipped = 0;
  let failed = 0;
  const failures: Array<{ cell: string; username: string; reason: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const rowNo = i + 2; // csv visual row, header is row 1
    const cell = `A${rowNo}`;
    const cols = parseCsvLine(lines[i]);

    const username = String(cols[0] ?? "").trim();
    const panelPassword = String(cols[1] ?? "").trim();
    const planName = String(cols[2] ?? "").trim();
    const startRaw = String(cols[3] ?? "").trim();
    const endRaw = String(cols[4] ?? "").trim();

    try {
      if (!username) {
        failed++;
        failures.push({ cell, username, reason: "missing_username" });
        continue;
      }
      if (!validUsername(username)) {
        failed++;
        failures.push({ cell, username, reason: "invalid_username" });
        continue;
      }
      if (panelPassword.length < 6) {
        failed++;
        failures.push({ cell, username, reason: "password_too_short" });
        continue;
      }

      if (existingPanelUsernames.has(username.toLowerCase())) {
        skipped++;
        continue;
      }

      // plan assignment rules
      let planId: string | null = null;
      let startAt: Date | null = null;
      let endAt: Date | null = null;

      if (planName) {
        const plan = planByName.get(planName.toLowerCase());
        if (plan) {
          const s = parseDateLike(startRaw);
          const e = parseDateLike(endRaw);
          if (s && e) {
            const now = new Date();
            // 规则：开始时间晚于结束时间，或结束时间已过期 -> 按无订阅处理
            if (s.getTime() < e.getTime() && e.getTime() > now.getTime()) {
              planId = plan.id;
              startAt = s;
              endAt = e;
            }
          }
          // if plan filled but start/end missing/非法/过期/范围错误 => treat as no plan
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

      existingPanelUsernames.add(username.toLowerCase());

      if (planId && startAt && endAt) {
        const sub = await prisma.subscription.create({
          data: {
            userId: user.id,
            planId,
            status: "ACTIVE",
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

            let usersRes = embyUsersCache.get(sid);
            if (!usersRes) {
              usersRes = await embyFetchUsers(server.baseUrl, apiKey);
              embyUsersCache.set(sid, usersRes);
            }

            let embyUserId: string | null = null;
            if (usersRes.ok) {
              const found = usersRes.users.find((u: any) => String(u?.Name ?? "").toLowerCase() === username.toLowerCase());
              if (found?.Id) {
                embyUserId = String(found.Id);
              }
            }

            if (!embyUserId) {
              const created = await embyCreateUser(server.baseUrl, apiKey, username);
              if (created.ok && created.userId) {
                embyUserId = created.userId;
                // refresh cache for subsequent rows
                embyUsersCache.delete(sid);
              }
            }

            if (embyUserId) {
              await prisma.embyUserLink.upsert({
                where: { userId_embyServerId: { userId: user.id, embyServerId: sid } },
                update: { embyUserId, disabled: false },
                create: { userId: user.id, embyServerId: sid, embyUserId, disabled: false },
              });
              await embySetUserDisabled(server.baseUrl, apiKey, embyUserId, false);
            }
          }
        }
      }

      success++;
    } catch (e: any) {
      failed++;
      failures.push({ cell, username, reason: e?.message || "import_failed" });
    }
  }

  return NextResponse.json({
    ok: true,
    success,
    skipped,
    failed,
    failures,
  });
}
