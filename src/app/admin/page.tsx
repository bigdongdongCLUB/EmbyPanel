import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { getDashboardStats } from "./dashboard-stats";

function Card({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
    </div>
  );
}

export default async function AdminHome() {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role;
  if (!session) redirect("/login");
  if (role !== "ADMIN") redirect("/portal");

  const stats = await getDashboardStats(7);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">仪表盘</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card title="面板用户总数" value={String(stats.panelUserCount)} />
        <Card title="所有 Emby 服务器 30 日活跃用户" value={String(stats.embyActive30dTotal)} />
        <Card title="即将到期用户" value={String(stats.expiringSoonCount)} hint={`未来 ${stats.expiringSoonDays} 天内到期`} />
      </div>

      <div className="bg-white border rounded-lg p-4">
        <div className="font-medium text-sm">各 Emby 服务器活跃概览（30 天）</div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-[600px] w-full text-sm">
            <thead className="text-left text-gray-600 border-b">
              <tr>
                <th className="py-2 px-3">服务器</th>
                <th className="py-2 px-3">活跃用户</th>
                <th className="py-2 px-3">总用户</th>
                <th className="py-2 px-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {stats.perServer.map((s) => (
                <tr key={s.id} className="border-b last:border-b-0">
                  <td className="py-2 px-3">{s.name}</td>
                  <td className="py-2 px-3">{s.ok ? s.active30d : "-"}</td>
                  <td className="py-2 px-3">{s.ok ? s.totalUsers : "-"}</td>
                  <td className="py-2 px-3">{s.ok ? "✅" : `异常：${s.error ?? "unknown"}`}</td>
                </tr>
              ))}
              {!stats.perServer.length ? (
                <tr>
                  <td className="py-6 px-3 text-gray-500" colSpan={4}>
                    暂无已启用的 Emby 服务器
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
