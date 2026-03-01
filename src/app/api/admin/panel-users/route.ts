export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { hashPassword } from "@/lib/password";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      enabled: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, users });
}

const CreateSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(6).max(200),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum(["USER", "ADMIN"]).optional(),
  enabled: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const passwordHash = await hashPassword(parsed.data.password);

  const user = await prisma.user.create({
    data: {
      username: parsed.data.username,
      email: parsed.data.email ? parsed.data.email : null,
      passwordHash,
      role: (parsed.data.role as any) ?? "USER",
      enabled: parsed.data.enabled ?? true,
      expiryReminderEnabled: true,
    },
    select: { id: true, username: true, email: true, role: true, enabled: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, user }, { status: 201 });
}
