"use client";

import { UiImage } from "@/components/ui-image";
import { useEffect, useState } from "react";
import { SettingsTabs } from "./tabs";

type FormState = {
  siteName: string;
  siteDescription: string;
  siteLogoDataUrl: string | null;
};

const MAX_LOGO_SIZE = 2 * 1024 * 1024;

export function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ siteName: "EmbyPanel", siteDescription: "See the BestEmby", siteLogoDataUrl: null });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings/basic", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setForm(json.data);
    } catch (e: any) {
      setError(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">系统设置</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <SettingsTabs />

      <div className="border border-[#eaeaea] rounded-2xl bg-white p-6 space-y-5">
        <div className="text-lg font-semibold">基础设置</div>

        <div>
          <label className="text-sm">网站名称</label>
          <input
            className="mt-2 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none"
            value={form.siteName}
            onChange={(e) => setForm((s) => ({ ...s, siteName: e.target.value }))}
            maxLength={100}
          />
        </div>

        <div>
          <label className="text-sm">网站描述</label>
          <textarea
            className="mt-2 w-full border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none min-h-[90px]"
            value={form.siteDescription}
            onChange={(e) => setForm((s) => ({ ...s, siteDescription: e.target.value }))}
            maxLength={300}
          />
        </div>

        <div>
          <label className="text-sm">网站Logo</label>
          <div className="mt-2 flex items-center gap-3">
            <label className="inline-flex items-center border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 focus:border-[#e3001b] outline-none cursor-pointer hover:bg-gray-50">
              上传Logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > MAX_LOGO_SIZE) {
                    alert("文件过大，请上传不超过 2MB 的图片");
                    return;
                  }
                  const r = new FileReader();
                  r.onload = () => {
                    const data = String(r.result || "");
                    setForm((s) => ({ ...s, siteLogoDataUrl: data || null }));
                  };
                  r.readAsDataURL(f);
                }}
              />
            </label>
            {form.siteLogoDataUrl ? (
              <button className="text-sm text-red-600" onClick={() => setForm((s) => ({ ...s, siteLogoDataUrl: null }))}>
                移除Logo
              </button>
            ) : null}
          </div>
          <div className="text-xs text-gray-500 mt-2">支持 JPG、PNG、GIF、WebP 格式，文件大小不超过 2MB</div>
          {form.siteLogoDataUrl ? <UiImage src={form.siteLogoDataUrl} alt="logo" className="mt-3 h-14 w-14 rounded-full object-cover border" /> : null}
        </div>

        <div className="pt-3">
          <button
            className="bg-[#e3001b] text-white rounded px-4 py-2 disabled:opacity-60"
            disabled={saving || !form.siteName.trim()}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const res = await fetch("/api/admin/settings/basic", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(form),
                });
                const json = await res.json().catch(() => null);
                if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                alert("保存设置成功");
              } catch (e: any) {
                setError(e?.message || "save_failed");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "保存中…" : "保存设置"}
          </button>
        </div>
      </div>
    </div>
  );
}
