export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const KEY = "announcements_list";

export async function GET() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const list = Array.isArray(row?.valueJson) ? (row!.valueJson as any[]) : [];
  const now = Date.now();

  const rows = list
    .filter((x) => !!x?.enabled)
    .filter((x) => !x?.startAt || new Date(x.startAt).getTime() <= now)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map((x) => ({
      id: String(x.id || ""),
      title: String(x.title || ""),
      content: String(x.content || ""),
      createdAt: x.createdAt || null,
    }));

  return NextResponse.json({ ok: true, rows });
}
