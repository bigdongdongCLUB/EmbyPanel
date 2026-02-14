"use client";

import { useEffect, useMemo, useState } from "react";

type Data = {
  dashboard: {
    balanceYuan: number;
    subscriptionEndAt: string | null;
    subscriptionPlan: string;
    remainingDays: number;
  };
  announcements: Array<{ id: string; title: string; content: string }>;
};

function fmtDateYmd(v?: string | null) {
  if (!v) return "--";
  return new Date(v).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export function PortalClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [noticeIndex, setNoticeIndex] = useState(0);

  const notices = useMemo(() => data?.announcements ?? [], [data]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/dashboard", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e: any) {
      setError(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!notices.length) {
      setNoticeIndex(0);
      return;
    }
    setNoticeIndex((i) => (i >= notices.length ? 0 : i));
  }, [notices.length]);

  useEffect(() => {
    if (notices.length <= 1) return;
    const t = window.setInterval(() => {
      setNoticeIndex((i) => (i + 1) % notices.length);
    }, 5000);
    return () => window.clearInterval(t);
  }, [notices.length]);

  const isExpired = !!data?.dashboard.subscriptionEndAt && new Date(data.dashboard.subscriptionEndAt).getTime() < Date.now();

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
        <div className="border rounded-lg p-2"><div className="text-xs text-gray-500">账户余额</div><div className="text-xl font-semibold mt-1">{(data?.dashboard.balanceYuan ?? 0).toFixed(2)} <span className="text-xs font-normal">元</span></div></div>
        <div className="border rounded-lg p-2"><div className="text-xs text-gray-500">订阅到期日</div><div className="mt-1 flex items-center gap-2"><div className="text-xl font-semibold">{fmtDateYmd(data?.dashboard.subscriptionEndAt)}</div>{isExpired ? <div className="inline-flex items-center rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">已过期</div> : null}</div></div>
        <div className="border rounded-lg p-2"><div className="text-xs text-gray-500">订阅计划</div><div className="text-xl font-semibold mt-1">{data?.dashboard.subscriptionPlan ?? "无订阅"}</div></div>
        <div className="border rounded-lg p-2"><div className="text-xs text-gray-500">剩余时间</div><div className="text-xl font-semibold mt-1">{data?.dashboard.remainingDays ?? 0} <span className="text-xs font-normal">天</span></div></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
        <div className="border rounded-lg">
          <div className="px-2 py-1.5 border-b text-sm font-medium text-center">系统公告</div>
          <div className="p-2 text-center">
            <div className="text-sm font-semibold text-center">{notices[noticeIndex]?.title ?? "系统公告"}</div>
            <div className="text-xs text-gray-700 mt-1.5 whitespace-pre-wrap min-h-[56px] text-center">{notices[noticeIndex]?.content ?? "暂无公告"}</div>
            {notices.length > 1 ? (
              <div className="mt-2 flex items-center justify-center gap-1.5">
                {notices.map((n, i) => (
                  <button
                    key={n.id || i}
                    type="button"
                    className={"h-2.5 w-2.5 min-h-0 p-0 rounded-full shrink-0 " + (i === noticeIndex ? "bg-blue-600" : "bg-gray-300")}
                    onClick={() => setNoticeIndex(i)}
                    aria-label={`切换公告 ${i + 1}`}
                    style={{ minHeight: 10 }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="border rounded-lg">
          <div className="px-2 py-1.5 border-b text-sm font-medium text-center">卡密兑换</div>
          <div className="p-2 space-y-2 text-center">
            <div className="text-xs text-gray-600 text-center">输入卡密可快速充值余额或激活订阅。</div>
            <input
              className="w-full border rounded px-2 py-1.5 text-xs font-mono text-center"
              placeholder="请输入卡密"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            />
            <button
              className="w-full bg-blue-600 text-white rounded px-2 py-1.5 text-xs disabled:opacity-50"
              disabled={!redeemCode.trim() || redeeming}
              onClick={async () => {
                setRedeeming(true);
                try {
                  const res = await fetch("/api/portal/redeem", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ code: redeemCode.trim() }),
                  });
                  const json = await res.json().catch(() => null);
                  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
                  alert("兑换成功");
                  setRedeemCode("");
                  await refresh();
                } catch (e: any) {
                  alert(`兑换失败: ${e?.message || "unknown"}`);
                } finally {
                  setRedeeming(false);
                }
              }}
            >
              兑换并使用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
