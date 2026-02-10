import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalClient } from "./portal-client";

export default async function PortalPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = (session as any)?.role;
  if (role === "ADMIN") redirect("/admin");

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">用户中心</h1>
      <PortalClient />
    </main>
  );
}
