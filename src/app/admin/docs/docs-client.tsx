"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdownLite } from "@/lib/markdown-lite";

type Doc = {
  id: string;
  title: string;
  content: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export function DocsAdminClient() {
  const [items, setItems] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [published, setPublished] = useState(true);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/docs", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      setItems(j?.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const previewHtml = useMemo(() => renderMarkdownLite(content), [content]);

  function openCreate() {
    setId("");
    setTitle("");
    setContent("");
    setPublished(true);
    setEditOpen(true);
  }

  function openEdit(doc: Doc) {
    setId(doc.id);
    setTitle(doc.title);
    setContent(doc.content);
    setPublished(!!doc.published);
    setEditOpen(true);
  }

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
      setEditOpen(false);
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

      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="p-3 flex items-center justify-end gap-2 border-b">
          <button className="bg-blue-600 text-white rounded px-3 py-2 text-sm" onClick={openCreate}>
            + 新建文档
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium">标题</th>
                <th className="text-left px-4 py-3 font-medium">类型</th>
                <th className="text-left px-4 py-3 font-medium">排序</th>
                <th className="text-left px-4 py-3 font-medium">状态</th>
                <th className="text-left px-4 py-3 font-medium">创建时间</th>
                <th className="text-left px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-4 text-gray-500" colSpan={6}>
                    加载中…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-gray-500" colSpan={6}>
                    暂无文档
                  </td>
                </tr>
              ) : (
                items.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="px-4 py-3">{d.title}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded border px-2 py-0.5 text-xs text-gray-600">未分类</span>
                    </td>
                    <td className="px-4 py-3">0</td>
                    <td className="px-4 py-3">
                      {d.published ? (
                        <span className="inline-flex items-center rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">已发布</span>
                      ) : (
                        <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">未发布</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{new Date(d.createdAt).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 text-sm">
                        <button className="text-gray-700 hover:text-blue-600" onClick={() => openEdit(d)}>
                          编辑
                        </button>
                        <button className="text-red-600 hover:text-red-700" onClick={() => removeDoc(d.id)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 border-t text-sm text-gray-600 flex items-center justify-end">共 {items.length} 篇文档</div>
      </div>

      {editOpen ? (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4" onClick={() => setEditOpen(false)}>
          <div className="w-full max-w-5xl max-h-[92vh] overflow-auto bg-white rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b font-medium">编辑文档</div>
            <div className="p-4 space-y-3">
              <input className="w-full border rounded px-3 py-2" placeholder="文档标题" value={title} onChange={(e) => setTitle(e.target.value)} />

              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> 发布状态
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
                  className="w-full min-h-[260px] text-sm outline-none"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Markdown 文档内容（支持拖拽图片上传）"
                />
              </div>
              <div className="text-xs text-gray-500">提示：拖拽图片到编辑框会自动上传并插入 Markdown 图片语法。</div>

              <div className="border rounded-lg p-3">
                <div className="text-sm font-medium mb-2">预览</div>
                <div className="docs-content" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>

              <div className="flex gap-2 pt-1">
                <button className="bg-gray-700 text-white rounded px-3 py-2 text-sm" disabled={saving} onClick={save}>
                  {saving ? "保存中…" : "保存文档"}
                </button>
                <button className="border rounded px-3 py-2 text-sm" onClick={() => setEditOpen(false)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
