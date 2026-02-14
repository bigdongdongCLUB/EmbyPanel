export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

function mapJobName(jobName: string) {
  const m: Record<string, string> = {
    "emby-health-check": "Emby服务器健康检查",
    "subscription-expiry-disable": "订阅到期禁用",
    "subscription-expiry-reminder": "订阅到期提醒",
    "anomaly-scan": "播放异常检测",
    "anomaly-unban": "处罚自动解禁",
  };
  return m[jobName] || jobName;
}

function triggerMode(jobName: string) {
  if (jobName === "anomaly-unban") return "定时任务（每1分钟）";
  if (jobName === "emby-health-check") return "定时任务（每10分钟）";
  if (jobName === "subscription-expiry-disable") return "定时任务（每10分钟）";
  if (jobName === "subscription-expiry-reminder") return "定时任务（每10分钟）";
  if (jobName === "anomaly-scan") return "定时任务（每10分钟）";
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

  const where: any = jobName ? { jobName } : {};

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

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayRows = await prisma.jobRun.findMany({ where: { startedAt: { gte: startOfDay } }, select: { ok: true, jobName: true } });

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
