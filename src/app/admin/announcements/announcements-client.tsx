"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdownLite } from "@/lib/markdown-lite";

function ImeInput({ value, onChange, ...props }: any) {
  const [composing, setComposing] = useState(false);
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    setLocalValue(value ?? "");
  }, [value]);

  return (
    <input
      {...props}
      value={localValue}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={(e) => {
        const v = e.currentTarget.value;
        setComposing(false);
        setLocalValue(v);
        onChange(v);
      }}
      onChange={(e) => {
        const v = e.target.value;
        setLocalValue(v);
        if (!composing) onChange(v);
      }}
    />
  );
}

type Row = {
  id: string;
  title: string;
  content: string;
  allVisible?: boolean;
  createdAt: string;
  updatedAt: string;
};

function fmt(v?: string | null) {
  if (!v) return "--";
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function AnnouncementsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [allVisible, setAllVisible] = useState(true);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const canSave = useMemo(() => !!content.trim(), [content]);
  const previewHtml = useMemo(() => renderMarkdownLite(content), [content]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/announcements", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setRows(json.rows || []);
    } catch (e: any) {
      alert(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function openCreate() {
    setEditId(null);
    setTitle("");
    setContent("");
    setAllVisible(true);
    setOpen(true);
  }

  function openEdit(r: Row) {
    setEditId(r.id);
    setTitle(r.title);
    setContent(r.content);
    setAllVisible(r.allVisible !== false);
    setOpen(true);
  }

  async function uploadImage(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/docs/upload", { method: "POST", body: fd });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || "upload_failed");
    return String(json.url);
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
      <h1 className="text-xl font-semibold">公告管理</h1>

      <div className="flex items-center justify-end">
        <button className="h-7 bg-[#e3001b] text-white rounded px-3 text-xs" onClick={openCreate}>
          + 发布公告
        </button>
      </div>

      <div className="border rounded overflow-auto bg-white">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="border-b text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">标题</th>
              <th className="px-3 py-2">可见范围</th>
              <th className="px-3 py-2">创建时间</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="px-3 py-2">{r.title}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{r.allVisible === false ? "仅有效订阅计划用户" : "所有人"}</td>
                <td className="px-3 py-2">{fmt(r.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3 text-xs">
                    <button className="text-gray-700" onClick={() => openEdit(r)}>编辑</button>
                    <button
                      className="text-red-600"
                      onClick={async () => {
                        if (!(await (window as any).showConfirm("确认删除该公告？"))) return;
                        await fetch(`/api/admin/announcements?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
                        await refresh();
                      }}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !rows.length ? (
              <tr>
                <td className="px-3 py-6 text-gray-500" colSpan={4}>暂无公告</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#eaeaea] rounded-2xl w-full max-w-3xl p-4 space-y-3">
            <div className="text-lg font-semibold">{editId ? "编辑公告" : "发布公告"}</div>

            <div>
              <label className="text-sm">公告标题</label>
              <ImeInput key={`title-${editId ?? 'new'}`} className="mt-1 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none" value={title} onChange={setTitle} placeholder="请输入公告标题" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={allVisible}
                onChange={(e) => setAllVisible(e.target.checked)}
              />
              所有人可见
            </label>
            <div className="text-xs text-gray-500 -mt-2">取消勾选后，该公告仅对有有效订阅计划的用户显示。</div>

            <div>
              <label className="text-sm">公告内容</label>
              <div
                className="mt-1 border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus-within:border-[#e3001b]"
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
                  key={`content-${editId ?? "new"}`}
                  ref={taRef}
                  className="w-full h-[220px] max-h-[320px] resize-y overflow-y-auto bg-transparent outline-none text-sm"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={async (e) => {
                    const files = Array.from(e.clipboardData?.files ?? []);
                    const img = files.find((f) => String(f.type || "").startsWith("image/"));
                    if (!img) return;
                    e.preventDefault();
                    try {
                      await insertImage(img);
                    } catch (err: any) {
                      alert(`图片上传失败: ${err?.message || err}`);
                    }
                  }}
                  placeholder="Markdown 公告内容（支持拖拽/粘贴图片上传）"
                />
              </div>
              <div className="mt-1 text-xs text-gray-500">提示：拖拽图片或 Ctrl+V / Cmd+V 粘贴图片到编辑框，会自动上传并插入 Markdown 图片语法。</div>
            </div>

            <div className="border rounded-lg p-3">
              <div className="text-sm font-medium mb-2">预览</div>
              <div className="max-h-[320px] overflow-y-auto pr-1">
                <div className="docs-content" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="bg-[#e3001b] hover:bg-[#c20017] text-white rounded-lg px-3 py-2 disabled:opacity-60"
                disabled={!canSave}
                onClick={async () => {
                  const payload = {
                    title: title.trim(),
                    content,
                    allVisible,
                  };
                  const res = await fetch("/api/admin/announcements", {
                    method: editId ? "PATCH" : "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(editId ? { id: editId, ...payload } : payload),
                  });
                  const json = await res.json().catch(() => null);
                  if (!res.ok) {
                    alert(json?.error || `HTTP ${res.status}`);
                    return;
                  }
                  setOpen(false);
                  await refresh();
                }}
              >
                {editId ? "保存" : "发布公告"}
              </button>
              <button className="border bg-white rounded px-3 py-2" onClick={() => setOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
