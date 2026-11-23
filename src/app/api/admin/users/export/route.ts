export const runtime = "nodejs";

import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { PassThrough, Readable } from "node:stream";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

const DEFAULT_PASSWORD = "test1234";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  const headers = { "Cache-Control": "private, no-store" };
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });

  const now = new Date();
  const activeSubscription = {
    status: "ACTIVE",
    planId: { not: null },
    endAt: { gt: now },
  } satisfies Prisma.SubscriptionWhereInput;
  const users = await prisma.user.findMany({
    where: { subscriptions: { some: activeSubscription } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      username: true,
      passwordHash: true,
      email: true,
      maxConcurrentPlaybacks: true,
      maxConcurrentPlaybacksExpiresAt: true,
      createdAt: true,
      subscriptions: {
        where: activeSubscription,
        orderBy: [{ endAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { endAt: true },
      },
    },
  });

  const output = new PassThrough();
  const stream = Readable.toWeb(output) as ReadableStream<Uint8Array>;
  const stop = () => output.destroy();
  req.signal.addEventListener("abort", stop, { once: true });
  output.once("close", () => req.signal.removeEventListener("abort", stop));
  if (req.signal.aborted) stop();
  void writeUsersWorkbook(output, users, now).catch((error: unknown) => {
    output.destroy(error instanceof Error ? error : new Error("user_export_failed"));
  });

  return new Response(stream, {
    headers: {
      ...headers,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="embypanel-users.xlsx"',
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}

async function writeUsersWorkbook(output: PassThrough, users: {
  username: string;
  email: string | null;
  passwordHash: string;
  maxConcurrentPlaybacks: number;
  maxConcurrentPlaybacksExpiresAt: Date | null;
  createdAt: Date;
  subscriptions: { endAt: Date }[];
}[], now: Date) {
  if (output.destroyed) return;
  // Write XLSX incrementally while bcrypt checks run.
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true, zip: { store: true } });
  const sheet = workbook.addWorksheet("用户", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "用户名", width: 28 },
    { header: "邮箱", width: 40 },
    { header: "同播数量", width: 14 },
    { header: "创建时间", width: 29 },
    { header: "到期时间", width: 29 },
    { header: "是否使用默认密码", width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = "A1:F1";
  sheet.getRow(1).commit();

  for (const user of users) {
    if (output.destroyed) return;
    const subscription = user.subscriptions[0];
    if (!subscription) continue;
    const hasEffectiveLimit = user.maxConcurrentPlaybacksExpiresAt && user.maxConcurrentPlaybacksExpiresAt > now;
    const usesDefaultPassword = await verifyPassword(DEFAULT_PASSWORD, user.passwordHash);
    if (output.destroyed) return;
    sheet.addRow([
      user.username,
      user.email,
      hasEffectiveLimit ? user.maxConcurrentPlaybacks : 1,
      user.createdAt.toISOString(),
      subscription.endAt.toISOString(),
      usesDefaultPassword ? "是" : "否",
    ]).commit();
  }

  await workbook.commit();
}
