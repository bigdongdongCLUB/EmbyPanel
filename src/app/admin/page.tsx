import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { getDashboardStats } from "./dashboard-stats";
import { UserTrendChart } from "./user-trend-chart";

function StatCard({ title, value, hint, highlight, badge }: { title: string; value: string; hint?: string; highlight?: boolean; badge?: string }) {
  return (
    <div className={"relative rounded-2xl p-7 border-2 " + (highlight ? "border-[#e3001b] bg-white shadow-[0_8px_24px_rgba(227,0,27,0.08)]" : "border-transparent bg-white shadow-sm")}>
      {badge ? <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#e3001b] text-white text-xs px-4 py-1 rounded-full font-bold">{badge}</div> : null}
      <div className="text-sm text-[#888]">{title}</div>
      <div className={"mt-2 text-4xl font-bold " + (highlight ? "text-[#e3001b]" : "text-[#222]")}>{value}</div>
      {hint ? <div className="mt-2 text-sm text-[#888]">{hint}</div> : null}
    </div>
  );
}

export default async function AdminHome() {
  const session = await getServerSession(authOptions);
  const role = (session as { role?: string | null } | null)?.role;
  if (!session) redirect("/login");
  if (role !== "ADMIN") redirect("/portal");

  const stats = await getDashboardStats(7);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#222]">仪表盘</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="面板用户总数" value={String(stats.panelUserCount)} />
        <StatCard
          title="所有 Emby 服务器 30 日活跃用户"
          value={String(stats.embyActive30dTotal)}
          hint={stats.activeSnapshotAt ? `每日 01:00 更新：${new Date(stats.activeSnapshotAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}` : "每日 01:00 更新"}
        />
        <StatCard title="即将到期用户" value={String(stats.expiringSoonCount)} hint={`未来 ${stats.expiringSoonDays} 天内到期`} highlight badge="需关注" />
      </div>

      <UserTrendChart series={stats.userTrend30d} />

      <div className="bg-white border border-[#eaeaea] rounded-2xl p-8 shadow-sm">
        <div className="text-base font-bold text-[#222] mb-5">各 Emby 服务器活跃概览（30 天）</div>
        <div className="overflow-auto">
          <table className="min-w-[600px] w-full text-sm">
            <thead className="text-left text-[#888] border-b border-[#eaeaea] bg-[#f8f9fa]">
              <tr>
                <th className="py-3 px-3 font-medium">服务器</th>
                <th className="py-3 px-3 font-medium">活跃用户</th>
                <th className="py-3 px-3 font-medium">总用户</th>
                <th className="py-3 px-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {stats.perServer.map((s) => (
                <tr key={s.id} className="border-b border-[#eaeaea] last:border-b-0">
                  <td className="py-4 px-3 text-[#222]">{s.name}</td>
                  <td className="py-4 px-3 text-[#222]">{s.ok ? s.active30d : "-"}</td>
                  <td className="py-4 px-3 text-[#222]">{s.ok ? s.totalUsers : "-"}</td>
                  <td className="py-4 px-3">
                    {s.ok ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-green-50 text-green-600 border border-green-200">✓</span>
                    ) : (
                      <span className="text-red-600">异常：{s.error ?? "unknown"}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!stats.perServer.length ? (
                <tr>
                  <td className="py-10 px-3 text-[#aaa] text-center" colSpan={4}>
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
