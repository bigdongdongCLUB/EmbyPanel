"use client";

import { useEffect, useMemo, useState } from "react";
import { renderMarkdownLite } from "@/lib/markdown-lite";

type Doc = { id: string; title: string; content: string; updatedAt: string };

export function DocsPortalClient() {
  const [items, setItems] = useState<Doc[]>([]);
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    fetch("/api/portal/docs", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list = (j?.items ?? []) as Doc[];
        setItems(list);
        if (list[0]) setActiveId(list[0].id);
      })
      .catch(() => setItems([]));
  }, []);

  const active = useMemo(() => items.find((x) => x.id === activeId) || items[0] || null, [items, activeId]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">使用文档</h1>

      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((d) => (
            <button
              key={d.id}
              className={`border rounded px-3 py-1.5 text-sm ${active?.id === d.id ? "border-blue-500 text-blue-600" : ""}`}
              onClick={() => setActiveId(d.id)}
            >
              {d.title}
            </button>
          ))}
        </div>
      ) : null}

      {!active ? (
        <div className="text-sm text-gray-500">暂无已发布文档</div>
      ) : (
        <div className="border rounded-lg p-4">
          <div className="text-xl font-semibold mb-2">{active.title}</div>
          <div className="text-xs text-gray-500 mb-3">更新于：{new Date(active.updatedAt).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}</div>
          <div className="docs-content prose max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdownLite(active.content) }} />
        </div>
      )}
    </div>
  );
}
