export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const row = await prisma.appSetting.findUnique({ where: { key: "vod_settings" } });
  const apiKey = ((row?.valueJson as any)?.tmdbApiKey ?? "").trim();

  if (!apiKey) return NextResponse.json({ error: "no_api_key", message: "请先填写 TMDB API Key" }, { status: 400 });

  try {
    const url = `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => null);

    if (!res.ok || data?.success === false) {
      return NextResponse.json({ ok: false, message: `TMDB 返回错误: ${data?.status_message ?? `HTTP ${res.status}`}` });
    }

    return NextResponse.json({ ok: true, message: "TMDB API 连接正常 ✓" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: `连接失败: ${e?.message ?? String(e)}` });
  }
}
