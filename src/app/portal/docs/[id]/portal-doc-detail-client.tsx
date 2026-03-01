"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { renderMarkdownLite } from "@/lib/markdown-lite";

type Doc = { id: string; title: string; content: string; updatedAt: string };

export function PortalDocDetailClient({ id }: { id: string }) {
  const [item, setItem] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/docs/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setItem(j?.item ?? null))
      .catch(() => setItem(null))
      .finally(() => setLoading(false));
  }, [id]);

  const html = useMemo(() => renderMarkdownLite(item?.content || ""), [item?.content]);

  return (
    <div className="space-y-4">
      <div>
        <Link className="text-sm text-blue-600 hover:text-blue-700" href="/portal/docs">← 返回文档列表</Link>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">加载中…</div>
      ) : !item ? (
        <div className="text-sm text-gray-500">文档不存在或未发布</div>
      ) : (
        <div className="border rounded-lg p-4 bg-white">
          <div className="text-xl font-semibold mb-2">{item.title}</div>
          <div className="text-xs text-gray-500 mb-3">更新于：{new Date(item.updatedAt).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}</div>
          <div className="docs-content" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );
}
