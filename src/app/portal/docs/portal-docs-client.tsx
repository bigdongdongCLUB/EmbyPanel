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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">使用文档</h1>

      <div className="border rounded-lg bg-white overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left px-4 py-3 font-medium">标题</th>
              <th className="text-left px-4 py-3 font-medium">更新时间</th>
              <th className="text-left px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-gray-500" colSpan={3}>加载中…</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-gray-500" colSpan={3}>暂无已发布文档</td>
              </tr>
            ) : (
              items.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-4 py-3">{d.title}</td>
                  <td className="px-4 py-3">{new Date(d.updatedAt).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}</td>
                  <td className="px-4 py-3">
                    <Link
                      className="inline-flex items-center p-1 rounded hover:bg-blue-50"
                      href={`/portal/docs/${d.id}`}
                      title="查看文档"
                    >
                      <img
                        src="/icons/docs.svg"
                        alt="查看文档"
                        className="h-4 w-4"
                        style={{ filter: "brightness(0) saturate(100%) invert(35%) sepia(93%) saturate(1600%) hue-rotate(205deg) brightness(95%) contrast(92%)" }}
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
