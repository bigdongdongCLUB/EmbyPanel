import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AdminShellClient } from "./shell-client";
import { AdminSidebarClient } from "./sidebar-client";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any)?.role;
  if (role !== "ADMIN") redirect("/portal");

  const username = (session as any)?.user?.name ?? (session as any)?.user?.email ?? (session as any)?.username ?? "admin";

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebarClient username={username} />

      <div className="pl-60">
        <header className="sticky top-0 z-10 h-14 bg-white border-b flex items-center justify-end px-4">
          <AdminShellClient username={username} />
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
