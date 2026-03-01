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
    <div className="space-y-5 max-w-[1000px] mx-auto">
      <div>
        <Link className="inline-flex items-center text-sm text-[#e3001b] hover:text-[#c20017]" href="/portal/docs">← 返回文档列表</Link>
      </div>

      {loading ? (
        <div className="text-sm text-[#888]">加载中…</div>
      ) : !item ? (
        <div className="text-sm text-[#888]">文档不存在或未发布</div>
      ) : (
        <div className="border border-[#eaeaea] rounded-2xl p-6 bg-white shadow-sm">
          <div className="text-2xl font-bold text-[#222] mb-2">{item.title}</div>
          <div className="text-xs text-[#888] mb-4">更新于：{new Date(item.updatedAt).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}</div>
          <div className="docs-content" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );
}
