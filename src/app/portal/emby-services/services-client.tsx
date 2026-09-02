"use client";

import { UiImage } from "@/components/ui-image";
import { useEffect, useRef, useState } from "react";

type Data = {
  subscription: { planName: string; endAt: string | null; canDeleteExpired?: boolean; serverCount: number; onlineCount: number };
  aggregate: { movieCount: number; seriesCount: number; episodeCount: number; songCount: number };
  servers: Array<{
    id: string;
    name: string;
    online: boolean;
    banned: boolean;
    banTypeLabel?: string | null;
    penaltyUnlockAt?: string | null;
    anomalyDetail?: {
      ips: string[];
      description: string;
      sessions: Array<{ device: string; client: string; ip: string; nowPlaying: string }>;
      detectedAt: string;
      unlockedAt?: string | null;
    } | null;
    recentPenaltyDetails?: Array<NonNullable<Data["servers"][number]["anomalyDetail"]>>;
    version: string;
    baseUrl: string;
    externalUrl?: string | null;
    backupUrl?: string | null;
    embyUserId: string | null;
    counts: { movieCount: number; seriesCount: number; episodeCount: number; songCount: number };
  }>;
  user: { username: string; syncPassword?: string | null };
};

type AnomalyDialog = {
  serverName: string;
  details: Array<NonNullable<Data["servers"][number]["anomalyDetail"]>>;
};

type QuickImportPlayer = "forward" | "senplayer" | "vidhub" | "hills" | "xiaohuan";

type QuickImportDialog = {
  serverName: string;
  routeLabel: "主线路" | "备用线路";
  endpoint: ReturnType<typeof parseBaseUrl>;
};

const QUICK_IMPORT_PLAYERS: Array<{ id: QuickImportPlayer; name: string; supported: boolean }> = [
  { id: "forward", name: "Forward", supported: true },
  { id: "senplayer", name: "SenPlayer", supported: true },
  { id: "vidhub", name: "VidHub", supported: true },
  { id: "hills", name: "Hills", supported: true },
  { id: "xiaohuan", name: "小幻影视", supported: true },
];

function fmtDate(v?: string | null) {
  if (!v) return "--";
  return new Date(v).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function fmtDateTime(v?: string | null) {
  if (!v) return "--";
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function parseBaseUrl(u: string) {
  try {
    const x = new URL(u);
    const protocol = x.protocol.replace(":", "").toUpperCase();
    const port = x.port || (x.protocol === "https:" ? "443" : x.protocol === "http:" ? "80" : "-");
    return { host: x.hostname, address: `${x.protocol}//${x.hostname}`, port, protocol };
  } catch {
    return { host: u, address: u, port: "-", protocol: "-" };
  }
}

function buildQuickImportUrl(
  player: QuickImportPlayer,
  endpoint: ReturnType<typeof parseBaseUrl>,
  username: string,
  password: string,
  title: string,
) {
  const protocol = endpoint.protocol.toLowerCase();
  if (!endpoint.host || !endpoint.port || endpoint.port === "-" || !["http", "https"].includes(protocol)) return null;

  if (player === "senplayer") {
    const params = new URLSearchParams({
      type: "emby",
      address: `${protocol}://${endpoint.host}:${endpoint.port}`,
      username,
      password,
    });
    return `senplayer://importserver?${params.toString()}`;
  }

  if (player === "forward" || player === "vidhub" || player === "hills") {
    const params = new URLSearchParams({
      type: "emby",
      scheme: protocol,
      host: endpoint.host,
      port: endpoint.port,
      username,
      password,
    });
    return `${player}://import?${params.toString()}`;
  }

  if (player === "xiaohuan") {
    const params = new URLSearchParams({
      type: "emby",
      title,
      scheme: protocol,
      host: endpoint.host,
      port: endpoint.port,
      username,
      password,
    });
    return `rodelplayer://import?${params.toString()}`;
  }

  return null;
}

function PhoneIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="18.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

async function copyTextSafe(text: string) {
  const value = String(text || "").trim();
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("readonly", "readonly");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}

export function PortalEmbyServicesClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingServerId, setSyncingServerId] = useState<string | null>(null);
  const [deletingSubscription, setDeletingSubscription] = useState(false);
  const [anomalyDialog, setAnomalyDialog] = useState<AnomalyDialog | null>(null);
  const [quickImportDialog, setQuickImportDialog] = useState<QuickImportDialog | null>(null);
  const [quickImportPlayer, setQuickImportPlayer] = useState<QuickImportPlayer>("forward");
  const [quickImportPassword, setQuickImportPassword] = useState("");
  const [quickImportPasswordVisible, setQuickImportPasswordVisible] = useState(false);
  const [quickImportMessage, setQuickImportMessage] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [endpointCopyFeedback, setEndpointCopyFeedback] = useState<{ key: string; ok: boolean } | null>(null);
  const copiedEndpointTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!passwordVisible) return;
    const timer = window.setTimeout(() => setPasswordVisible(false), 10000);
    return () => window.clearTimeout(timer);
  }, [passwordVisible]);

  useEffect(() => {
    return () => {
      if (copiedEndpointTimerRef.current) clearTimeout(copiedEndpointTimerRef.current);
    };
  }, []);

  function openAnomalyDialog(serverName: string, details: Array<NonNullable<Data["servers"][number]["anomalyDetail"]>>) {
    if (!details.length) return;
    setAnomalyDialog({ serverName, details });
  }

  function openQuickImportDialog(serverName: string, routeLabel: "主线路" | "备用线路", endpoint: ReturnType<typeof parseBaseUrl>) {
    setQuickImportPlayer("forward");
    setQuickImportPassword(data?.user.syncPassword || "");
    setQuickImportPasswordVisible(false);
    setQuickImportMessage(null);
    setQuickImportDialog({ serverName, routeLabel, endpoint });
  }

  function launchQuickImport() {
    if (!quickImportDialog || !data) return;
    if (!quickImportPassword) {
      setQuickImportMessage("请输入当前 Emby 密码");
      return;
    }
    const importUrl = buildQuickImportUrl(
      quickImportPlayer,
      quickImportDialog.endpoint,
      data.user.username,
      quickImportPassword,
      `${quickImportDialog.serverName}-${quickImportDialog.routeLabel}`,
    );
    if (!importUrl) {
      setQuickImportMessage("该播放器暂未公开服务器快捷导入协议");
      return;
    }
    setQuickImportMessage(null);
    window.location.href = importUrl;
  }

  async function copyEndpointAddress(address: string, key: string) {
    const ok = await copyTextSafe(address);
    setEndpointCopyFeedback({ key, ok });
    if (copiedEndpointTimerRef.current) clearTimeout(copiedEndpointTimerRef.current);
    copiedEndpointTimerRef.current = setTimeout(() => setEndpointCopyFeedback(null), 1600);
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/emby-services", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError((e as Error)?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {anomalyDialog ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="关闭异常监控详情"
            onClick={() => setAnomalyDialog(null)}
          />
          <div className="relative max-h-[86vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-[#eaeaea] bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <button
              type="button"
              className="absolute right-4 top-4 text-xl leading-none text-[#999] hover:text-[#222]"
              aria-label="关闭"
              onClick={() => setAnomalyDialog(null)}
            >
              ×
            </button>
            <div className="pr-8">
              <div className="text-lg font-bold text-[#222]">异常监控</div>
              <div className="mt-1 text-xs text-[#888]">{anomalyDialog.serverName}</div>
            </div>
            <div className="mt-5 max-h-[68vh] space-y-4 overflow-y-auto pr-1 text-sm">
              {anomalyDialog.details.map((detail, detailIndex) => (
                <div key={`${detail.detectedAt}-${detailIndex}`} className="rounded-xl border border-[#eef0f3] p-3">
                  {anomalyDialog.details.length > 1 ? (
                    <div className="mb-3 text-xs font-bold text-[#e3001b]">处罚记录 {detailIndex + 1}</div>
                  ) : null}
                  <div className="space-y-3 rounded-lg bg-[#f7f8fa] p-3 text-[#333]">
                    <div className="whitespace-pre-wrap leading-6">{detail.description || "暂无说明"}</div>
                    {detail.sessions.length > 0 ? (
                      <div className="space-y-2">
                        {detail.sessions.map((session, index) => (
                          <div key={`${detail.detectedAt}-${session.device}-${session.client}-${session.ip}-${index}`} className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 leading-6">
                            <div className="font-bold text-[#222]">
                              设备{index + 1}：{session.device || "未知设备"}
                              {session.client ? `（${session.client}）` : ""}
                            </div>
                            <div className="text-[#666]">IP：{session.ip || "-"}</div>
                            <div className="text-[#666]">{session.nowPlaying || "未知内容"}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap items-start gap-x-8 gap-y-3">
                    <div className="min-w-[190px]">
                      <div className="mb-1 text-xs font-bold text-[#888]">检测时间</div>
                      <div className="font-mono text-[#333]">{fmtDateTime(detail.detectedAt)}</div>
                    </div>
                    <div className="min-w-[190px]">
                      <div className="mb-1 text-xs font-bold text-[#888]">解封时间</div>
                      <div className="font-mono text-[#333]">{fmtDateTime(detail.unlockedAt)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {quickImportDialog ? (
        <div className="fixed inset-0 z-[310] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
            aria-label="关闭快捷导入"
            onClick={() => setQuickImportDialog(null)}
          />
          <div className="relative max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-[24px] border border-[#e7e7e7] bg-white px-5 py-6 shadow-[0_24px_70px_rgba(0,0,0,0.25)] sm:px-8 sm:py-8">
            <button
              type="button"
              className="absolute right-5 top-5 text-2xl leading-none text-[#222] hover:text-[#e3001b]"
              aria-label="关闭"
              onClick={() => setQuickImportDialog(null)}
            >
              ×
            </button>
            <div className="flex items-center gap-3 pr-10 text-2xl font-bold text-[#161616]">
              <PhoneIcon className="h-6 w-6 shrink-0 text-[#f2003c]" />
              <span>快捷导入</span>
            </div>
            <div className="mt-3 text-sm leading-6 text-[#888] sm:text-base">
              选择播放器并确认当前 Emby 密码，系统会使用{quickImportDialog.routeLabel}生成导入链接。
            </div>
            <div className="mt-2 text-xs text-[#aaa]">
              {quickImportDialog.serverName} · {quickImportDialog.endpoint.address}:{quickImportDialog.endpoint.port}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {QUICK_IMPORT_PLAYERS.map((player) => {
                const selected = quickImportPlayer === player.id;
                return (
                  <button
                    key={player.id}
                    type="button"
                    className={`relative min-h-12 rounded-xl border px-4 py-2 text-base font-semibold transition ${
                      selected
                        ? "border-[#f2003c] bg-[#f2003c] text-white"
                        : "border-[#dedede] bg-white text-[#161616] hover:border-[#f2003c]"
                    }`}
                    onClick={() => {
                      setQuickImportPlayer(player.id);
                      setQuickImportMessage(player.supported ? null : "该播放器暂未公开服务器快捷导入协议");
                    }}
                  >
                    {player.name}
                    {!player.supported ? (
                      <span className={`ml-2 text-[10px] font-normal ${selected ? "text-white/80" : "text-[#aaa]"}`}>暂不支持</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <label className="mt-6 block text-sm font-semibold text-[#333]" htmlFor="quick-import-password">
              Emby 密码
            </label>
            <div className="mt-2 flex items-center rounded-xl border border-[#dedede] bg-[#f8f9fa] px-4 focus-within:border-[#f2003c] focus-within:bg-white">
              <input
                id="quick-import-password"
                type={quickImportPasswordVisible ? "text" : "password"}
                value={quickImportPassword}
                autoComplete="current-password"
                className="min-w-0 flex-1 bg-transparent py-3 font-mono text-base text-[#222] outline-none"
                placeholder="请输入当前 Emby 密码"
                onChange={(event) => {
                  setQuickImportPassword(event.target.value);
                  setQuickImportMessage(null);
                }}
              />
              <button
                type="button"
                className="ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-[#eee]"
                aria-label={quickImportPasswordVisible ? "隐藏密码" : "显示密码"}
                onClick={() => setQuickImportPasswordVisible((visible) => !visible)}
              >
                <UiImage src={quickImportPasswordVisible ? "/icons/invisible.svg" : "/icons/visible.svg"} alt="" className="h-4 w-4 opacity-70" />
              </button>
            </div>
            {quickImportMessage ? <div className="mt-3 text-sm text-[#e3001b]">{quickImportMessage}</div> : null}
            <button
              type="button"
              className="mt-6 w-full rounded-xl bg-[#f2003c] px-4 py-3 text-base font-bold text-white transition hover:bg-[#d90035] disabled:cursor-not-allowed disabled:bg-[#c8c8c8]"
              disabled={!QUICK_IMPORT_PLAYERS.find((player) => player.id === quickImportPlayer)?.supported}
              onClick={launchQuickImport}
            >
              导入到 {QUICK_IMPORT_PLAYERS.find((player) => player.id === quickImportPlayer)?.name}
            </button>
            <div className="mt-3 text-center text-xs leading-5 text-[#aaa]">导入信息仅在当前浏览器中生成，不会额外保存密码。</div>
          </div>
        </div>
      ) : null}

      <h1 className="text-2xl font-bold text-[#222]">Emby 服务</h1>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="relative bg-white rounded-2xl border border-[#eaeaea] p-8">
          {data?.subscription.canDeleteExpired ? (
            <button
              className="absolute top-4 right-4 inline-flex items-center justify-center w-8 h-8 rounded-full border border-[#f2d4d9] bg-[#fff7f8] hover:border-[#e3001b] hover:bg-[#fff0f1] disabled:opacity-60"
              disabled={deletingSubscription}
              onClick={async () => {
                const ok = await (window as unknown as { showConfirm: (msg: string) => Promise<boolean> }).showConfirm("该操作会删除用户对应emby服务器上所有资料，且操作不可以逆");
                if (!ok) return;
                setDeletingSubscription(true);
                try {
                  const res = await fetch("/api/portal/emby-services", { method: "DELETE" });
                  const json = (await res.json().catch(() => null)) as { message?: string; error?: string; warn?: boolean } | null;
                  if (!res.ok) {
                    alert(json?.message || json?.error || `HTTP ${res.status}`);
                    return;
                  }
                  if (json?.warn) {
                    alert("订阅计划已删除，但部分服务器删除失败，请联系管理员检查。");
                  } else {
                    alert("订阅计划已删除");
                  }
                  await refresh();
                } finally {
                  setDeletingSubscription(false);
                }
              }}
              title="删除已到期订阅计划"
            >
              <UiImage src="/icons/delete.svg" alt="删除" className="w-3.5 h-3.5" />
            </button>
          ) : null}

          <div className="text-sm text-[#888] mb-4">订阅计划</div>
          <div className="text-[32px] font-bold text-[#222] leading-tight">{data?.subscription.planName ?? "无订阅"}</div>
          <div className="text-sm text-[#888] mt-2 mb-6">有效期至 {fmtDate(data?.subscription.endAt)}</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#f4f5f7] rounded-lg p-4 text-center">
              <div className="text-xs text-[#888]">已分配服务器</div>
              <div className="text-2xl font-bold text-[#222] mt-1">{data?.subscription.serverCount ?? 0}</div>
            </div>
            <div className="bg-[#f4f5f7] rounded-lg p-4 text-center">
              <div className="text-xs text-[#888]">在线服务器</div>
              <div className="text-2xl font-bold text-[#222] mt-1">{data?.subscription.onlineCount ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#eaeaea] p-8">
          <div className="text-sm text-[#888] mb-4">媒体库统计总览</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#f4f5f7] rounded-lg p-5 text-center">
              <div className="text-sm text-[#888] mb-1">🎬 电影</div>
              <div className="text-2xl font-bold text-[#222]">{data?.aggregate.movieCount ?? 0}</div>
            </div>
            <div className="bg-[#f4f5f7] rounded-lg p-5 text-center">
              <div className="text-sm text-[#888] mb-1">📺 电视剧</div>
              <div className="text-2xl font-bold text-[#222]">{data?.aggregate.seriesCount ?? 0}</div>
            </div>
            <div className="bg-[#f4f5f7] rounded-lg p-5 text-center">
              <div className="text-sm text-[#888] mb-1">🎞️ 集数</div>
              <div className="text-2xl font-bold text-[#222]">{data?.aggregate.episodeCount ?? 0}</div>
            </div>
            <div className="bg-[#f4f5f7] rounded-lg p-5 text-center">
              <div className="text-sm text-[#888] mb-1">🎵 音乐</div>
              <div className="text-2xl font-bold text-[#222]">{data?.aggregate.songCount ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {(data?.servers ?? []).map((s) => {
          const visitUrl = (s.baseUrl || "").trim();
          const mainEndpoint = parseBaseUrl(visitUrl);
          const backupEndpoint = s.backupUrl ? parseBaseUrl(String(s.backupUrl)) : null;
          const mainEndpointKey = `${s.id}:main`;
          const backupEndpointKey = `${s.id}:backup`;
          const mainEndpointFeedback = endpointCopyFeedback?.key === mainEndpointKey ? endpointCopyFeedback : null;
          const backupEndpointFeedback = endpointCopyFeedback?.key === backupEndpointKey ? endpointCopyFeedback : null;
          const stateText = s.banned ? (s.banTypeLabel ? `${s.banTypeLabel} 封禁中` : "封禁中") : s.online ? "在线" : "离线";
          const showPenaltyUnlockAt = !!(s.banned && s.banTypeLabel && s.penaltyUnlockAt);
          const recentPenaltyDetails = s.recentPenaltyDetails ?? [];
          const dialogDetails = recentPenaltyDetails.length
            ? recentPenaltyDetails
            : s.anomalyDetail
              ? [s.anomalyDetail]
              : [];
          const canShowAnomalyDetail = !!(dialogDetails.length && ((s.banned && s.banTypeLabel) || recentPenaltyDetails.length));
          return (
            <div key={s.id} className="relative bg-white border-2 border-[#e3001b] rounded-2xl p-8 shadow-[0_8px_24px_rgba(227,0,27,0.08)]">
              {canShowAnomalyDetail ? (
                <button
                  type="button"
                  className="absolute -top-3 left-1/2 inline-flex min-w-max -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#e3001b] px-4 py-1 text-xs font-bold tracking-wide text-white shadow-sm transition hover:bg-[#c90018] focus:outline-none focus:ring-2 focus:ring-[#e3001b]/25"
                  onClick={() => openAnomalyDialog(s.name, dialogDetails)}
                >
                  <span>状态：{stateText}</span>
                  <UiImage src="/icons/exclamation.svg" alt="点击查看详情" className="h-3.5 w-3.5 shrink-0 brightness-0 invert" />
                </button>
              ) : (
                <div className="absolute -top-3 left-1/2 min-w-max -translate-x-1/2 whitespace-nowrap bg-[#e3001b] text-white px-4 py-1 rounded-full text-xs font-bold tracking-wide">状态：{stateText}</div>
              )}
              {showPenaltyUnlockAt ? (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[12px] text-[#666] whitespace-nowrap">
                  解禁时间：{fmtDateTime(s.penaltyUnlockAt)}
                </div>
              ) : null}

              <div className="mb-6">
                <div className="text-[28px] font-bold text-[#222] leading-tight">{s.name}</div>
                <div className="text-sm text-[#888] mt-1">版本：{s.version || "-"}</div>
              </div>

              <div className="mb-6">
                <div className="text-[15px] font-bold text-[#222] mb-2 pb-2 border-b border-[#eaeaea]">节点媒体库统计</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between py-1.5"><span className="text-[#888]">🎬 电影</span><span className="font-medium text-[#222]">{s.counts.movieCount}</span></div>
                  <div className="flex items-center justify-between py-1.5"><span className="text-[#888]">📺 电视剧</span><span className="font-medium text-[#222]">{s.counts.seriesCount}</span></div>
                  <div className="flex items-center justify-between py-1.5"><span className="text-[#888]">🎞️ 集数</span><span className="font-medium text-[#222]">{s.counts.episodeCount}</span></div>
                  <div className="flex items-center justify-between py-1.5"><span className="text-[#888]">🎵 音乐</span><span className="font-medium text-[#222]">{s.counts.songCount}</span></div>
                </div>
              </div>

              <div className="bg-[#f4f5f7] rounded-xl p-5 mb-6 space-y-1.5 text-sm">
                <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">用户名:</span><span className="font-mono text-[15px] text-[#222]">{data?.user.username ?? "-"}</span></div>
                <div className="flex items-center py-2 border-b border-dashed border-[#dcdcdc]">
                  <span className="w-20 text-[#e3001b] font-bold">密码:</span>
                  <span className="min-w-0 flex-1 break-all font-mono text-[15px] text-[#222]">{passwordVisible ? data?.user.syncPassword || "-" : data?.user.syncPassword ? "••••••••" : "-"}</span>
                  {data?.user.syncPassword ? (
                    <button
                      type="button"
                      className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e2e4e8] bg-white hover:border-[#e3001b] hover:bg-[#fff7f8]"
                      aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                      onClick={() => setPasswordVisible((v) => !v)}
                    >
                      <UiImage src={passwordVisible ? "/icons/invisible.svg" : "/icons/visible.svg"} alt="" className="h-4 w-4 opacity-70" />
                    </button>
                  ) : null}
                </div>

                <div className="pt-1">
                  <div className="text-center text-[#8aaec2] text-xs font-semibold tracking-wide mb-1">主线路</div>
                  <div className="flex items-center py-2 border-b border-dashed border-[#dcdcdc]">
                    <span className="w-20 text-[#e3001b] font-bold">地址:</span>
                    <span className="min-w-0 flex-1 break-all font-mono text-[15px] text-[#222]">{mainEndpoint.address}</span>
                    <button
                      type="button"
                      className={`ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[13px] leading-none transition ${
                        mainEndpointFeedback?.ok
                          ? "border-green-200 bg-green-50 text-green-600"
                          : mainEndpointFeedback
                            ? "border-red-200 bg-red-50 text-red-600"
                          : "border-[#e2e4e8] bg-white text-[#666] hover:border-[#e3001b] hover:bg-[#fff7f8] hover:text-[#e3001b]"
                      }`}
                      title={mainEndpointFeedback?.ok ? "已复制地址" : mainEndpointFeedback ? "复制失败" : "复制地址"}
                      aria-label={mainEndpointFeedback?.ok ? "已复制主线路地址" : mainEndpointFeedback ? "主线路地址复制失败" : "复制主线路地址"}
                      onClick={() => void copyEndpointAddress(mainEndpoint.address, mainEndpointKey)}
                    >
                      {mainEndpointFeedback ? <span className="text-xs font-bold">{mainEndpointFeedback.ok ? "✓" : "×"}</span> : <UiImage src="/icons/copy.png" alt="" className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">端口:</span><span className="font-mono text-[15px] text-[#222]">{mainEndpoint.port}</span></div>
                  <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">协议:</span><span className="font-mono text-[15px] text-[#222]">{mainEndpoint.protocol}</span></div>
                  <div className="flex justify-center pt-3">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d9d9d9] bg-white px-4 py-2 text-sm font-semibold text-[#222] transition hover:border-[#e3001b] hover:bg-[#fff7f8] hover:text-[#e3001b]"
                      onClick={() => openQuickImportDialog(s.name, "主线路", mainEndpoint)}
                    >
                      <PhoneIcon />
                      快捷导入
                    </button>
                  </div>
                </div>

                {backupEndpoint ? (
                  <div className="pt-1">
                    <div className="text-center text-[#8aaec2] text-xs font-semibold tracking-wide mb-1">备用线路</div>
                    <div className="flex items-center py-2 border-b border-dashed border-[#dcdcdc]">
                      <span className="w-20 text-[#e3001b] font-bold">地址:</span>
                      <span className="min-w-0 flex-1 break-all font-mono text-[15px] text-[#222]">{backupEndpoint.address}</span>
                      <button
                        type="button"
                        className={`ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[13px] leading-none transition ${
                          backupEndpointFeedback?.ok
                            ? "border-green-200 bg-green-50 text-green-600"
                            : backupEndpointFeedback
                              ? "border-red-200 bg-red-50 text-red-600"
                            : "border-[#e2e4e8] bg-white text-[#666] hover:border-[#e3001b] hover:bg-[#fff7f8] hover:text-[#e3001b]"
                        }`}
                        title={backupEndpointFeedback?.ok ? "已复制地址" : backupEndpointFeedback ? "复制失败" : "复制地址"}
                        aria-label={backupEndpointFeedback?.ok ? "已复制备用线路地址" : backupEndpointFeedback ? "备用线路地址复制失败" : "复制备用线路地址"}
                        onClick={() => void copyEndpointAddress(backupEndpoint.address, backupEndpointKey)}
                      >
                        {backupEndpointFeedback ? <span className="text-xs font-bold">{backupEndpointFeedback.ok ? "✓" : "×"}</span> : <UiImage src="/icons/copy.png" alt="" className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="flex py-2 border-b border-dashed border-[#dcdcdc]"><span className="w-20 text-[#e3001b] font-bold">端口:</span><span className="font-mono text-[15px] text-[#222]">{backupEndpoint.port}</span></div>
                    <div className="flex py-2"><span className="w-20 text-[#e3001b] font-bold">协议:</span><span className="font-mono text-[15px] text-[#222]">{backupEndpoint.protocol}</span></div>
                    <div className="flex justify-center pt-3">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d9d9d9] bg-white px-4 py-2 text-sm font-semibold text-[#222] transition hover:border-[#e3001b] hover:bg-[#fff7f8] hover:text-[#e3001b]"
                        onClick={() => openQuickImportDialog(s.name, "备用线路", backupEndpoint)}
                      >
                        <PhoneIcon />
                        快捷导入
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3">
                <button
                  className="w-full text-center bg-white border border-[#e3001b] text-[#e3001b] rounded-lg px-4 py-3 text-base font-bold hover:bg-[#fff0f1] disabled:opacity-60"
                  disabled={!!syncingServerId}
                  onClick={async () => {
                    setSyncingServerId(s.id);
                    try {
                      const res = await fetch("/api/portal/emby-services/sync-password", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ embyServerId: s.id }),
                      });
                      const json = await res.json().catch(() => null);
                      if (!res.ok) {
                        alert(`同步失败: ${json?.error || `HTTP ${res.status}`}`);
                        return;
                      }
                      if ((json?.failedCount ?? 0) > 0) {
                        alert(`已部分同步：成功 ${json?.okCount ?? 0}，失败 ${json?.failedCount ?? 0}`);
                      } else {
                        alert("密码同步成功");
                      }
                    } finally {
                      setSyncingServerId(null);
                    }
                  }}
                >
                  {syncingServerId === s.id ? "同步中..." : "同步面板和Emby密码"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
