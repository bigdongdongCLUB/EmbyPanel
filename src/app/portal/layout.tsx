import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalSidebarClient } from "./sidebar-client";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any)?.role;
  if (role === "ADMIN") redirect("/admin");

  const username = (session as any)?.username ?? "user";

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalSidebarClient />

      <div className="pl-60">
        <header className="sticky top-0 z-10 h-14 bg-white border-b flex items-center justify-between px-4">
          <div className="text-sm text-gray-700">用户中心</div>
          <div className="text-sm text-gray-600">{username}</div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
