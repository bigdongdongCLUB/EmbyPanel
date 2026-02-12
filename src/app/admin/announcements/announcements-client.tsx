"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  startAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: "ACTIVE" | "INACTIVE";
};

function fmt(v?: string | null) {
  if (!v) return "长期有效";
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function AnnouncementsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [startAt, setStartAt] = useState("");

  const canSave = useMemo(() => title.trim() && content.trim(), [title, content]);

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
    setEnabled(true);
    setStartAt("");
    setOpen(true);
  }

  function openEdit(r: Row) {
    setEditId(r.id);
    setTitle(r.title);
    setContent(r.content);
    setEnabled(!!r.enabled);
    setStartAt(r.startAt ? r.startAt.slice(0, 16) : "");
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">公告管理</h1>

      <div className="flex items-center justify-end">
        <button className="h-7 bg-blue-600 text-white rounded px-3 text-xs" onClick={openCreate}>
          + 发布公告
        </button>
      </div>

      <div className="border rounded overflow-auto bg-white">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="border-b text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">标题</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">生效时间</th>
              <th className="px-3 py-2">创建时间</th>
              <th className="px-3 py-2">开关</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="px-3 py-2">{r.title}</td>
                <td className="px-3 py-2">{r.status === "ACTIVE" ? <span className="text-green-600">生效中</span> : <span className="text-gray-500">未生效</span>}</td>
                <td className="px-3 py-2">{fmt(r.startAt)}</td>
                <td className="px-3 py-2">{fmt(r.createdAt)}</td>
                <td className="px-3 py-2">
                  <button
                    className={"rounded-full px-2 py-1 text-xs " + (r.enabled ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600")}
                    onClick={async () => {
                      await fetch("/api/admin/announcements", {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ id: r.id, enabled: !r.enabled }),
                      });
                      await refresh();
                    }}
                  >
                    {r.enabled ? "开启" : "关闭"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3 text-xs">
                    <button className="text-gray-700" onClick={() => openEdit(r)}>编辑</button>
                    <button
                      className="text-red-600"
                      onClick={async () => {
                        if (!confirm("确认删除该公告？")) return;
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
                <td className="px-3 py-6 text-gray-500" colSpan={6}>暂无公告</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-3xl p-4 space-y-3">
            <div className="text-lg font-semibold">{editId ? "编辑公告" : "发布公告"}</div>

            <div>
              <label className="text-sm">公告标题</label>
              <input className="mt-1 w-full border rounded px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="请输入公告标题" />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm">发布状态</span>
              <button className={"rounded-full px-2 py-1 text-xs " + (enabled ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600")} onClick={() => setEnabled((v) => !v)}>
                {enabled ? "立即发布" : "草稿"}
              </button>
            </div>

            <div>
              <label className="text-sm">生效时间（可空，空=长期有效）</label>
              <input className="mt-1 w-full border rounded px-3 py-2" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>

            <div>
              <label className="text-sm">公告内容</label>
              <textarea className="mt-1 w-full border rounded px-3 py-2 min-h-[220px]" value={content} onChange={(e) => setContent(e.target.value)} placeholder="请输入公告内容" />
            </div>

            <div className="flex gap-2">
              <button
                className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-60"
                disabled={!canSave}
                onClick={async () => {
                  const payload = {
                    title: title.trim(),
                    content,
                    enabled,
                    startAt: startAt ? new Date(startAt).toISOString() : null,
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
              <button className="border rounded px-3 py-2" onClick={() => setOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
