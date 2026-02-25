"use client";

import { useEffect, useMemo, useState } from "react";
import { SettingsTabs } from "./tabs";
import { ToggleSwitch } from "./toggle-switch";

type Form = {
  enabled: boolean;
  mode: "LOOP" | "FIRST_ONLY";
  level: number;
  rate1: string;
  rate2: string;
  rate3: string;
};

export function InviteRebateClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ enabled: false, mode: "LOOP", level: 3, rate1: "10", rate2: "5", rate3: "2" });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings/invite-rebate", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setForm({
        enabled: !!json.data.enabled,
        mode: json.data.mode === "FIRST_ONLY" ? "FIRST_ONLY" : "LOOP",
        level: Number(json.data.level || 3),
        rate1: String(json.data.rate1 ?? 10),
        rate2: String(json.data.rate2 ?? 5),
        rate3: String(json.data.rate3 ?? 2),
      });
    } catch (e: any) {
      setError(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const example = useMemo(() => {
    const amount = 300;
    const r1 = Number(form.rate1 || 0);
    const r2 = Number(form.rate2 || 0);
    const r3 = Number(form.rate3 || 0);
    return {
      l1: ((amount * r1) / 100).toFixed(2),
      l2: ((amount * r2) / 100).toFixed(2),
      l3: ((amount * r3) / 100).toFixed(2),
    };
  }, [form.rate1, form.rate2, form.rate3]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">系统设置</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <SettingsTabs />

      <div className="border rounded-lg bg-white p-6 space-y-5">
        <div className="text-lg font-semibold">返利系统设置</div>

        <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700">
          <div className="font-medium text-blue-900 mb-2">返利系统说明</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>支持最多三级邀请返利活动，用户购买/续费订阅时，邀请人可获得返利奖励。</li>
            <li>循环返利：每次购买都返利；仅首次返利：被邀请人仅首次购买触发返利。</li>
            <li>三级返利示例：A→B→C→D，D 购买时 C/B/A 分别获得对应层级返利。</li>
          </ul>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-sm">启用返利系统</div>
            <ToggleSwitch checked={form.enabled} onChange={(next) => setForm((s) => ({ ...s, enabled: next }))} />
          </div>

          <div>
            <div className="text-sm mb-2">返利模式</div>
            <label className="inline-flex items-center gap-2 mr-6 text-sm">
              <input type="radio" checked={form.mode === "LOOP"} onChange={() => setForm((s) => ({ ...s, mode: "LOOP" }))} />
              循环返利
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" checked={form.mode === "FIRST_ONLY"} onChange={() => setForm((s) => ({ ...s, mode: "FIRST_ONLY" }))} />
              仅首次返利
            </label>
          </div>

          <div>
            <div className="text-sm mb-2">返利层级</div>
            <select className="border rounded px-3 py-2" value={form.level} onChange={(e) => setForm((s) => ({ ...s, level: Number(e.target.value) }))}>
              <option value={1}>一级</option>
              <option value={2}>二级</option>
              <option value={3}>三级</option>
            </select>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="font-medium">返利比例配置</div>
            <div>
              <label className="text-sm">一级返利比例 (%)</label>
              <input className="mt-1 w-full border rounded px-3 py-2" value={form.rate1} onChange={(e) => setForm((s) => ({ ...s, rate1: e.target.value }))} />
            </div>
            {form.level >= 2 ? (
              <div>
                <label className="text-sm">二级返利比例 (%)</label>
                <input className="mt-1 w-full border rounded px-3 py-2" value={form.rate2} onChange={(e) => setForm((s) => ({ ...s, rate2: e.target.value }))} />
              </div>
            ) : null}
            {form.level >= 3 ? (
              <div>
                <label className="text-sm">三级返利比例 (%)</label>
                <input className="mt-1 w-full border rounded px-3 py-2" value={form.rate3} onChange={(e) => setForm((s) => ({ ...s, rate3: e.target.value }))} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="font-medium mb-2">返利计算示例</div>
          <div>假设用户购买 ¥300 订阅：</div>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>一级邀请人：¥300 × {form.rate1 || 0}% = ¥{example.l1}</li>
            {form.level >= 2 ? <li>二级邀请人：¥300 × {form.rate2 || 0}% = ¥{example.l2}</li> : null}
            {form.level >= 3 ? <li>三级邀请人：¥300 × {form.rate3 || 0}% = ¥{example.l3}</li> : null}
          </ul>
        </div>

        <div className="pt-2 flex gap-2">
          <button
            className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-60"
            disabled={saving}
            onClick={async () => {
              const payload = {
                enabled: form.enabled,
                mode: form.mode,
                level: form.level,
                rate1: Number(form.rate1 || "0"),
                rate2: Number(form.rate2 || "0"),
                rate3: Number(form.rate3 || "0"),
              };

              if ([payload.rate1, payload.rate2, payload.rate3].some((x) => !Number.isFinite(x) || x < 0 || x > 100)) {
                alert("返利比例需在 0~100 之间");
                return;
              }

              setSaving(true);
              setError(null);
              try {
                const res = await fetch("/api/admin/settings/invite-rebate", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const json = await res.json().catch(() => null);
                if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                alert("保存返利设置成功");
              } catch (e: any) {
                setError(e?.message || "save_failed");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "保存中…" : "保存返利设置"}
          </button>
          <button className="border rounded px-4 py-2" onClick={refresh}>重置</button>
        </div>
      </div>
    </div>
  );
}
