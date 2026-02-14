"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  jobName: string;
  jobLabel: string;
  penaltyMode: string;
  executedAt: string;
  result: string;
  ok: boolean | null;
};

type Data = {
  summary: { todayTotal: number; todaySuccess: number; todayFailed: number; jobTypes: number };
  rows: Row[];
  total: number;
  page: number;
  totalPages: number;
};

function Card({ title, value, color }: { title: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="text-xs text-gray-500">{title}</div>
      <div className={`mt-2 text-3xl font-semibold ${color || "text-gray-900"}`}>{value}</div>
    </div>
  );
}

function fmt(v?: string) {
  if (!v) return "-";
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function JobsClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [jobName, setJobName] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const u = new URL(window.location.origin + "/api/admin/jobs/runs");
      if (jobName) u.searchParams.set("jobName", jobName);
      u.searchParams.set("page", String(page));
      u.searchParams.set("pageSize", String(pageSize));
      const res = await fetch(u.toString(), { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobName, page, pageSize]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card title="今日执行次数" value={data?.summary.todayTotal ?? 0} color="text-blue-600" />
        <Card title="成功执行" value={data?.summary.todaySuccess ?? 0} color="text-green-600" />
        <Card title="执行失败" value={data?.summary.todayFailed ?? 0} color="text-rose-600" />
        <Card title="任务类型" value={data?.summary.jobTypes ?? 0} color="text-violet-600" />
      </div>

      <div className="bg-white border rounded-lg p-3 flex flex-wrap gap-2 items-center">
        <select className="border rounded px-3 py-2" value={jobName} onChange={(e) => { setPage(1); setJobName(e.target.value); }}>
          <option value="">全部任务类型</option>
          <option value="emby-health-check">Emby服务器健康检查</option>
          <option value="subscription-expiry-disable">订阅到期禁用</option>
          <option value="subscription-expiry-reminder">订阅到期提醒</option>
          <option value="anomaly-scan">播放异常检测</option>
          <option value="anomaly-unban">处罚自动解禁</option>
        </select>

        <select className="border rounded px-3 py-2" value={String(pageSize)} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }}>
          <option value="20">20 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </select>

        <button className="border rounded px-3 py-2" onClick={refresh} disabled={loading}>刷新</button>
        {loading ? <span className="text-sm text-gray-500">加载中…</span> : null}
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}

      <div className="bg-white border rounded-lg overflow-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="text-left text-gray-600 border-b">
            <tr>
              <th className="py-2 px-3">任务名称</th>
              <th className="py-2 px-3">处罚方式</th>
              <th className="py-2 px-3">执行时间</th>
              <th className="py-2 px-3">处理结果</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="py-2 px-3">{r.jobLabel}</td>
                <td className="py-2 px-3">{r.penaltyMode}</td>
                <td className="py-2 px-3">{fmt(r.executedAt)}</td>
                <td className="py-2 px-3">
                  <span className={r.ok === false ? "text-red-600" : r.ok === true ? "text-green-600" : "text-gray-600"}>{r.result}</span>
                </td>
              </tr>
            ))}
            {!loading && (data?.rows?.length ?? 0) === 0 ? (
              <tr>
                <td className="py-8 px-3 text-gray-500" colSpan={4}>暂无任务记录</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-sm">
        <button className="border rounded px-3 py-1.5 disabled:opacity-50" disabled={(data?.page ?? 1) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</button>
        <span className="text-gray-600">第 {data?.page ?? 1} / {data?.totalPages ?? 1} 页</span>
        <button className="border rounded px-3 py-1.5 disabled:opacity-50" disabled={(data?.page ?? 1) >= (data?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}>下一页</button>
      </div>
    </div>
  );
}
