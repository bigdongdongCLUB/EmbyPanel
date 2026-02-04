import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function AdminHome() {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role;
  if (!session) redirect("/login");
  if (role !== "ADMIN") {
    return (
      <main className="p-6 max-w-2xl mx-auto">
        <h1 className="text-xl font-semibold">管理后台</h1>
        <p className="mt-2 text-red-600">当前账号没有 ADMIN 权限。</p>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold">管理后台</h1>
      <p className="mt-2 text-gray-600">接下来会在这里做：服务器/用户/订阅/异常管理。</p>

      <div className="mt-6 space-y-2">
        <div>
          <Link className="underline" href="/admin/servers">
            Emby 服务器管理
          </Link>
        </div>
        <div>
          <Link className="underline" href="/admin/users">
            用户管理
          </Link>
        </div>
      </div>
    </main>
  );
}
