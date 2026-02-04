import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { AdminShellClient } from "./shell-client";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any)?.role;
  if (role !== "ADMIN") redirect("/portal");

  const username = (session as any)?.user?.name ?? (session as any)?.user?.email ?? (session as any)?.username ?? "admin";

  return (
    <div className="min-h-screen bg-gray-50">
      <aside className="fixed inset-y-0 left-0 w-60 bg-[#0f172a] text-white flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-white/10">
          <Link href="/admin" className="font-semibold tracking-wide">
            BestEmby
          </Link>
        </div>

        <nav className="flex-1 p-2 space-y-1 text-sm">
          <Link className="block px-3 py-2 rounded hover:bg-white/10" href="/admin">
            仪表盘
          </Link>
          <Link className="block px-3 py-2 rounded hover:bg-white/10" href="/admin/users">
            用户管理
          </Link>
          <Link className="block px-3 py-2 rounded hover:bg-white/10" href="/admin/subscriptions">
            订阅管理
          </Link>
          <Link className="block px-3 py-2 rounded hover:bg-white/10" href="/admin/servers">
            Emby 服务器
          </Link>
        </nav>

        <div className="p-3 border-t border-white/10 text-xs text-white/70">{username}</div>
      </aside>

      <div className="pl-60">
        <header className="sticky top-0 z-10 h-14 bg-white border-b flex items-center justify-end px-4">
          <AdminShellClient />
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
