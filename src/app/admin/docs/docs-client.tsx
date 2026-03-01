"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdownLite } from "@/lib/markdown-lite";

type Doc = { id: string; title: string; content: string; published: boolean; updatedAt: string };

export function DocsAdminClient() {
  const [items, setItems] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [published, setPublished] = useState(true);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  async function refresh() {
    setLoading(true);
    const r = await fetch("/api/admin/docs", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    setItems(j?.items ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const previewHtml = useMemo(() => renderMarkdownLite(content), [content]);

  async function save() {
    if (!title.trim()) return alert("请填写文档标题");
    setSaving(true);
    try {
      const r = await fetch("/api/admin/docs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: id || undefined, title, content, published }),
      });
      if (!r.ok) throw new Error(await r.text());
      await refresh();
      alert("保存成功");
    } catch (e: any) {
      alert(`保存失败: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  async function removeDoc(docId: string) {
    if (!(await (window as any).showConfirm?.("确定删除该文档？") ?? confirm("确定删除该文档？"))) return;
    const r = await fetch(`/api/admin/docs?id=${encodeURIComponent(docId)}`, { method: "DELETE" });
    if (!r.ok) return alert("删除失败");
    if (id === docId) {
      setId("");
      setTitle("");
      setContent("");
      setPublished(true);
    }
    await refresh();
  }

  async function uploadImage(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/admin/docs/upload", { method: "POST", body: fd });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || "upload_failed");
    return String(j.url);
  }

  async function insertImage(file: File) {
    const url = await uploadImage(file);
    const md = `\n![${file.name}](${url})\n`;
    const ta = taRef.current;
    if (!ta) {
      setContent((x) => x + md);
      return;
    }
    const st = ta.selectionStart ?? content.length;
    const ed = ta.selectionEnd ?? content.length;
    const next = content.slice(0, st) + md + content.slice(ed);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      const p = st + md.length;
      ta.setSelectionRange(p, p);
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">文档管理</h1>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="border rounded-lg p-3 xl:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">文档列表</div>
            <button className="text-xs border rounded px-2 py-1" onClick={() => { setId(""); setTitle(""); setContent(""); setPublished(true); }}>+ 新建</button>
          </div>
          {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}
          <div className="space-y-2 max-h-[65vh] overflow-auto pr-1">
            {items.map((d) => (
              <div key={d.id} className={`border rounded p-2 ${id === d.id ? "border-blue-400 bg-blue-50" : ""}`}>
                <button
                  className="w-full text-left"
                  onClick={() => {
                    setId(d.id);
                    setTitle(d.title);
                    setContent(d.content);
                    setPublished(!!d.published);
                  }}
                >
                  <div className="font-medium truncate">{d.title}</div>
                  <div className="text-xs text-gray-500 mt-1">{d.published ? "已发布" : "未发布"}</div>
                </button>
                <button className="mt-2 text-xs text-red-600" onClick={() => removeDoc(d.id)}>删除</button>
              </div>
            ))}
            {!loading && items.length === 0 ? <div className="text-sm text-gray-500">暂无文档</div> : null}
          </div>
        </div>

        <div className="border rounded-lg p-3 xl:col-span-2 space-y-3">
          <div className="font-medium">编辑文档</div>
          <input className="w-full border rounded px-3 py-2" placeholder="文档标题" value={title} onChange={(e) => setTitle(e.target.value)} />

          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> 发布
          </label>

          <div
            className="border rounded p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (!f) return;
              try {
                await insertImage(f);
              } catch (err: any) {
                alert(`图片上传失败: ${err?.message || err}`);
              }
            }}
          >
            <textarea
              ref={taRef}
              className="w-full min-h-[320px] text-sm outline-none"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Markdown 文档内容（支持拖拽图片上传）"
            />
          </div>
          <div className="text-xs text-gray-500">提示：拖拽图片到编辑框会自动上传并插入 Markdown 图片语法。</div>

          <div className="flex gap-2">
            <button className="bg-gray-700 text-white rounded px-3 py-2 text-sm" disabled={saving} onClick={save}>{saving ? "保存中…" : "保存文档"}</button>
          </div>

          <div className="border-t pt-3">
            <div className="font-medium mb-2">预览</div>
            <div className="docs-content prose max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      </div>
    </div>
  );
}
