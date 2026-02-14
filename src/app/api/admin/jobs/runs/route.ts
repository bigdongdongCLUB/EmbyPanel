export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

function startOfShanghaiDayUtc(now = new Date()) {
  const shanghaiMs = now.getTime() + 8 * 60 * 60 * 1000;
  const shanghai = new Date(shanghaiMs);
  const y = shanghai.getUTCFullYear();
  const m = shanghai.getUTCMonth();
  const d = shanghai.getUTCDate();
  return new Date(Date.UTC(y, m, d) - 8 * 60 * 60 * 1000);
}

function mapJobName(jobName: string) {
  const m: Record<string, string> = {
    "emby-health-check": "Emby服务器健康检查",
    "subscription-expiry-disable": "订阅到期禁用",
    "subscription-expiry-reminder": "订阅到期提醒",
    "anomaly-scan": "播放异常检测",
    "anomaly-unban": "处罚自动解禁",
    "cache-cleanup": "缓存清理", 
  };
  return m[jobName] || jobName;
}

function triggerMode(jobName: string) {
  if (jobName === "anomaly-unban") return "定时任务（每1分钟）";
  if (jobName === "emby-health-check") return "定时任务（每10分钟）";
  if (jobName === "subscription-expiry-disable") return "定时任务（每10分钟）";
  if (jobName === "subscription-expiry-reminder") return "定时任务（每10分钟）";
  if (jobName === "anomaly-scan") return "定时任务（每5分钟）";
  if (jobName === "cache-cleanup") return "定时任务（每日 02:00）";
  return "定时任务";
}

function resultText(ok: boolean | null, message?: string | null) {
  if (ok === false) return message ? `失败：${message}` : "失败";
  if (ok === true) {
    if (!message) return "成功";
    try {
      const j = JSON.parse(message);
      if (typeof j?.createdEvents === "number") return `成功：异常${j.createdEvents}，扫描${j.scannedSessions ?? 0}`;
      if (typeof j?.unbanned === "number") return `成功：解禁${j.unbanned}，跳过${j.skipped ?? 0}`;
      if (typeof j?.okCount === "number") return `成功：健康OK ${j.okCount}，失败${j.failCount ?? 0}`;
      if (typeof j?.linksDisabled === "number") return `成功：禁用${j.linksDisabled}，告警${j.apiWarnings ?? 0}`;
      if (typeof j?.sent === "number") return `成功：已发送${j.sent}`;
      if (typeof j?.snapshotsDeleted === "number") return `成功：快照清理${j.snapshotsDeleted}，任务日志清理${j.jobRunsDeleted ?? 0}`;
      return "成功";
    } catch {
      return "成功";
    }
  }
  return "执行中";
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.max(10, Math.min(200, Number(url.searchParams.get("pageSize") ?? "20") || 20));
  const jobName = (url.searchParams.get("jobName") ?? "").trim();

  const now = new Date();
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 仅保留24小时内任务结果
  await prisma.jobRun.deleteMany({ where: { startedAt: { lt: cutoff24h } } });

  const where: any = { startedAt: { gte: cutoff24h }, ...(jobName ? { jobName } : {}) };

  const [rows, total] = await Promise.all([
    prisma.jobRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        jobName: true,
        startedAt: true,
        finishedAt: true,
        ok: true,
        message: true,
      },
    }),
    prisma.jobRun.count({ where }),
  ]);

  // 今日执行次数按 Asia/Shanghai 每日0点清零重新累计
  const shanghaiStart = startOfShanghaiDayUtc(now);
  const todayRows = await prisma.jobRun.findMany({ where: { startedAt: { gte: shanghaiStart } }, select: { ok: true, jobName: true } });

  return NextResponse.json({
    ok: true,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      todayTotal: todayRows.length,
      todaySuccess: todayRows.filter((x) => x.ok === true).length,
      todayFailed: todayRows.filter((x) => x.ok === false).length,
      jobTypes: new Set(todayRows.map((x) => x.jobName)).size,
    },
    rows: rows.map((r) => ({
      id: r.id,
      jobName: r.jobName,
      jobLabel: mapJobName(r.jobName),
      triggerMode: triggerMode(r.jobName),
      executedAt: r.startedAt,
      result: resultText(r.ok, r.message),
      ok: r.ok,
    })),
  });
}
