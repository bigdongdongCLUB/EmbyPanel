"use client";

import { useEffect, useState } from "react";
import { PaginationBar } from "@/components/pagination-bar";

type Row = {
  id: string;
  jobName: string;
  jobLabel: string;
  triggerMode: string;
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
    <div className="bg-white border border-[#eaeaea] rounded-2xl p-4">
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
  const [pageSize, setPageSize] = useState(10);

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card title="今日执行次数" value={data?.summary.todayTotal ?? 0} color="text-[#e3001b]" />
        <Card title="成功执行" value={data?.summary.todaySuccess ?? 0} color="text-green-600" />
        <Card title="执行失败" value={data?.summary.todayFailed ?? 0} color="text-rose-600" />
        <Card title="任务类型" value={data?.summary.jobTypes ?? 0} color="text-violet-600" />
      </div>

      <div className="bg-white border border-[#eaeaea] rounded-2xl p-3 flex flex-wrap gap-2 items-center">
        <select className="border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={jobName} onChange={(e) => { setPage(1); setJobName(e.target.value); }}>
          <option value="">全部任务类型</option>
          <option value="emby-health-check">Emby服务器健康检查</option>
          <option value="subscription-expiry-disable">订阅到期禁用</option>
          <option value="subscription-expiry-reminder">订阅到期提醒</option>
          <option value="anomaly-scan">播放异常检测</option>
          <option value="anomaly-unban">处罚自动解禁</option>
          <option value="cache-cleanup">缓存清理</option>
        </select>

        <button className="border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" onClick={refresh} disabled={loading}>刷新</button>
        {loading ? <span className="text-sm text-gray-500">加载中…</span> : null}
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}

      <div className="bg-white border border-[#eaeaea] rounded-2xl overflow-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="text-left text-gray-600 border-b">
            <tr>
              <th className="py-2 px-3">任务名称</th>
              <th className="py-2 px-3">触发方式</th>
              <th className="py-2 px-3">执行时间</th>
              <th className="py-2 px-3">处理结果</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="py-2 px-3">{r.jobLabel}</td>
                <td className="py-2 px-3">{r.triggerMode}</td>
                <td className="py-2 px-3">{fmt(r.executedAt)}</td>
                <td className="py-2 px-3">
                  <span className={r.ok === false ? "text-red-600" : r.ok === true ? "text-green-600" : "text-gray-600"}>
                    {r.result.split(/(异常\d+|失败\d*|失败：[^，, ]*)/g).map((part, i) => {
                      if (!part) return null;

                      const mAbnormal = part.match(/^异常(\d+)$/);
                      if (mAbnormal) {
                        const n = Number(mAbnormal[1]);
                        return <span key={i} className={n > 0 ? "text-red-600" : ""}>{part}</span>;
                      }

                      const mFail = part.match(/^失败(\d*)$/);
                      if (mFail) {
                        const raw = mFail[1];
                        const n = raw === "" ? 1 : Number(raw);
                        return <span key={i} className={n > 0 ? "text-red-600" : ""}>{part}</span>;
                      }

                      if (/^失败：/.test(part)) {
                        return <span key={i} className="text-red-600">{part}</span>;
                      }

                      return <span key={i}>{part}</span>;
                    })}
                  </span>
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

      <div className="mt-3">
        <PaginationBar
          total={data?.total ?? 0}
          page={data?.page ?? 1}
          totalPages={data?.totalPages ?? 1}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => { setPage(1); setPageSize(n); }}
        />
      </div>
    </div>
  );
}
