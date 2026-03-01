"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Doc = { id: string; title: string; updatedAt: string };

export function DocsPortalClient() {
  const [items, setItems] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/docs", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setItems(j?.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-[1000px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-[#222]">使用文档</h1>
        <div className="text-sm text-[#888]">共 {items.length} 篇文档</div>
      </div>

      <div className="border border-[#eaeaea] rounded-2xl bg-white overflow-hidden shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-[#f8f9fa] text-[#666]">
            <tr>
              <th className="text-left px-5 py-3 font-medium">标题</th>
              <th className="text-left px-5 py-3 font-medium">更新时间</th>
              <th className="text-left px-5 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-5 py-10 text-[#888] text-center" colSpan={3}>加载中…</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-5 py-12 text-[#aaa] text-center" colSpan={3}>暂无已发布文档</td>
              </tr>
            ) : (
              items.map((d) => (
                <tr key={d.id} className="border-t border-[#eaeaea]">
                  <td className="px-5 py-4 text-[#222] font-medium">{d.title}</td>
                  <td className="px-5 py-4 text-[#666]">{new Date(d.updatedAt).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}</td>
                  <td className="px-5 py-4">
                    <Link className="inline-flex items-center p-1.5 rounded hover:bg-[#fff0f1]" href={`/portal/docs/${d.id}`} title="查看文档">
                      <img
                        src="/icons/docs.svg"
                        alt="查看文档"
                        className="h-4 w-4"
                        style={{ filter: "brightness(0) saturate(100%) invert(16%) sepia(98%) saturate(5512%) hue-rotate(346deg) brightness(93%) contrast(101%)" }}
                      />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
