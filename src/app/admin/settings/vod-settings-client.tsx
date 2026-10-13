"use client";

import { useEffect, useState } from "react";
import { SettingsTabs } from "./tabs";
import { ToggleSwitch } from "./toggle-switch";

type Settings = {
  enabled: boolean;
  tmdbApiKey: string;
  tmdbCacheHours: number;
  monthlyInitialPoints: number;
  dailySubmissionLimit: number;
};

const DEFAULTS: Settings = { enabled: false, tmdbApiKey: "", tmdbCacheHours: 12, monthlyInitialPoints: 300, dailySubmissionLimit: 3 };

export function VodSettingsClient() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings/vod", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.data) setSettings({ ...DEFAULTS, ...j.data }); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/settings/vod", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { setSaveMsg(`保存失败：${j?.error ?? `HTTP ${res.status}`}`); return; }
      setSaveMsg("保存成功");
      setTimeout(() => setSaveMsg(null), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function testApi() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/settings/vod/test", { method: "POST" });
      const j = await res.json().catch(() => null);
      setTestResult({ ok: j?.ok === true, message: j?.message ?? (res.ok ? "连接成功" : "连接失败") });
    } catch (e: unknown) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "请求失败" });
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">加载中…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">系统设置</h1>
      <SettingsTabs />

      <div className="border border-[#eaeaea] rounded-2xl bg-white p-6 space-y-5">
        <div className="text-lg font-semibold">点播功能</div>

        {/* 说明卡片 */}
      <div className="flex gap-3 rounded-xl border border-[#f3d4d8] bg-[#fff7f8] px-4 py-4">
        <span className="text-[#e3001b] text-lg mt-0.5 shrink-0">ℹ</span>
        <div className="text-sm text-gray-700 leading-relaxed">
          <div className="font-medium text-gray-800 mb-1">关于点播功能</div>
          点播功能允许用户请求添加电影和电视剧内容。启用此功能需要配置 TMDB API Key。API Key 可从{" "}
          <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer" className="text-[#e3001b] underline underline-offset-2">
            https://www.themoviedb.org/settings/api
          </a>{" "}获取。
        </div>
      </div>

      {/* 启用开关 */}
      <div className="space-y-1.5">
        <div className="text-sm font-medium text-gray-700">启用点播功能</div>
        <ToggleSwitch checked={settings.enabled} onChange={(next) => setSettings((s) => ({ ...s, enabled: next }))} />
        <p className="text-xs text-gray-400">
          开启后，需要在订阅管理中也开启点播功能才能生效。关闭后，用户端将不显示点播菜单
        </p>
      </div>

      {/* TMDB API Key */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">TMDB API Key</label>
        <div className="flex items-center border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 gap-2">
          <input
            type={keyVisible ? "text" : "password"}
            className="flex-1 text-sm outline-none font-mono"
            placeholder="请输入 TMDB API Key"
            value={settings.tmdbApiKey}
            onChange={(e) => setSettings((s) => ({ ...s, tmdbApiKey: e.target.value }))}
          />
          <button type="button" className="text-gray-400 hover:text-gray-600 text-base" onClick={() => setKeyVisible((v) => !v)}>
            {keyVisible ? "🙈" : "👁️"}
          </button>
        </div>
        <p className="text-xs text-gray-400">用于获取影视数据的 API Key</p>
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer" className="text-xs text-[#e3001b] hover:underline">
          获取 TMDB API Key →
        </a>
      </div>

      {/* 缓存时间 */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">
          <span className="text-red-500 mr-0.5">*</span>TMDB 数据缓存时间
        </label>
        <div className="flex items-center border border-[#eaeaea] bg-[#f4f5f7] rounded-lg px-3 py-2 gap-2 max-w-xs">
          <input
            type="number"
            min={1}
            max={168}
            className="flex-1 text-sm outline-none"
            value={settings.tmdbCacheHours}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSettings((s) => ({ ...s, tmdbCacheHours: Math.min(168, Math.max(1, v || 1)) }));
            }}
          />
          <span className="text-sm text-gray-400 shrink-0">小时</span>
        </div>
        <p className="text-xs text-gray-400">设置 TMDB 数据的缓存时间，减少 API 调用频率。范围: 1-168 小时（最多7天）</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="monthly-vod-points" className="text-sm font-medium text-gray-700">每月初始积分数</label>
        <div className="flex max-w-xs items-center gap-2 rounded-lg border border-[#eaeaea] bg-[#f4f5f7] px-3 py-2">
          <input
            id="monthly-vod-points"
            type="number"
            min={0}
            max={100000}
            step={1}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            value={settings.monthlyInitialPoints}
            onChange={(event) => setSettings((value) => ({ ...value, monthlyInitialPoints: Math.min(100000, Math.max(0, Math.trunc(Number(event.target.value) || 0))) }))}
          />
          <span className="shrink-0 text-sm text-gray-400">积分/月</span>
        </div>
        <p className="text-xs text-gray-400">默认 300 积分。保存后按新额度计算可用积分，保留本月已扣和预占记录。</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="daily-vod-submissions" className="text-sm font-medium text-gray-700">每日每人提交次数</label>
        <div className="flex max-w-xs items-center gap-2 rounded-lg border border-[#eaeaea] bg-[#f4f5f7] px-3 py-2">
          <input
            id="daily-vod-submissions"
            type="number"
            min={1}
            max={1000}
            step={1}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            value={settings.dailySubmissionLimit}
            onChange={(event) => setSettings((value) => ({ ...value, dailySubmissionLimit: Math.min(1000, Math.max(1, Math.trunc(Number(event.target.value) || 1))) }))}
          />
          <span className="shrink-0 text-sm text-gray-400">次/天</span>
        </div>
        <p className="text-xs text-gray-400">默认每人每天 3 次，消耗积分和免积分申请均计入次数。</p>
      </div>

      {/* 测试结果 */}
      {testResult && (
        <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${testResult.ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          <span className="shrink-0 mt-0.5">{testResult.ok ? "✓" : "✕"}</span>
          <span>{testResult.message}</span>
        </div>
      )}

      {/* 保存结果 */}
      {saveMsg && (
        <div className={`text-sm ${saveMsg.startsWith("保存成功") ? "text-green-600" : "text-red-600"}`}>{saveMsg}</div>
      )}

      {/* 操作按钮 */}
      <div className="pt-3 flex gap-2 items-center flex-wrap">
        <button
          className="bg-[#e3001b] text-white rounded px-4 py-2 disabled:opacity-60"
          onClick={save}
          disabled={saving}
        >
          {saving ? "保存中…" : "保存设置"}
        </button>
        <button
          className="border border-[#eaeaea] bg-white rounded-lg px-4 py-2 hover:bg-[#f4f5f7] disabled:opacity-60"
          onClick={testApi}
          disabled={testing}
        >
          {testing ? "测试中…" : "测试 API 连接"}
        </button>
      </div>
    </div>
    </div>
  );
}
