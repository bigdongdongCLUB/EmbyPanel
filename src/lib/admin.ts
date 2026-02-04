import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { ok: false as const, status: 401 as const, error: "unauthorized" as const };
  }
  const role = (session as any).role;
  if (role !== "ADMIN") {
    return { ok: false as const, status: 403 as const, error: "forbidden" as const };
  }
  return { ok: true as const, session };
}
