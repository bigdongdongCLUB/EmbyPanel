"use client";

import { useEffect, useState } from "react";

type Row = {
  invitedUsername: string;
  registerDate: string;
  planName: string;
  payCycle: string;
  paidAt: string;
  rebateAmount: string;
};

export function InvitesClient() {
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/invites", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setInviteCode(json.inviteCode || "");
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">我的邀请</h1>
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="border rounded-lg bg-white p-4">
        <div className="text-sm text-gray-600 mb-2">分享您的邀请码给朋友，邀请他们加入</div>
        <div className="flex items-center gap-2">
          <div
            className="flex-1 border rounded px-3 py-2 bg-gray-50 font-mono text-blue-600 text-lg cursor-text"
            onClick={() => {
              const text = inviteCode || "";
              if (!text) return;
              try {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(document.getElementById("invite-code-text")!);
                sel?.removeAllRanges();
                sel?.addRange(range);
              } catch {}
            }}
          >
            <span id="invite-code-text">{inviteCode || "-"}</span>
          </div>
          <button
            className="bg-blue-600 text-white rounded px-3 py-2 text-sm"
            onClick={async () => {
              const text = inviteCode || "";
              if (!text) {
                alert("邀请码为空");
                return;
              }

              let copied = false;
              try {
                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(text);
                  copied = true;
                }
              } catch {}

              if (!copied) {
                try {
                  const ta = document.createElement("textarea");
                  ta.value = text;
                  ta.style.position = "fixed";
                  ta.style.opacity = "0";
                  document.body.appendChild(ta);
                  ta.focus();
                  ta.select();
                  copied = document.execCommand("copy");
                  document.body.removeChild(ta);
                } catch {
                  copied = false;
                }
              }

              alert(copied ? "邀请码已复制" : "复制失败，请手动复制");
            }}
          >
            复制邀请码
          </button>
          <button
            className="border rounded px-3 py-2 text-sm"
            onClick={async () => {
              const ok = confirm("确认重新生成邀请码？旧邀请码将失效。");
              if (!ok) return;
              const res = await fetch("/api/portal/invites/regenerate", { method: "POST" });
              const json = await res.json().catch(() => null);
              if (!res.ok) {
                alert(json?.error || `HTTP ${res.status}`);
                return;
              }
              setInviteCode(json.inviteCode || "");
              alert("已重新生成邀请码");
            }}
          >
            重新生成
          </button>
        </div>
      </div>

      <div className="border rounded-lg bg-white overflow-auto">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="border-b text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">邀请用户</th>
              <th className="px-3 py-2">注册时间</th>
              <th className="px-3 py-2">订阅计划</th>
              <th className="px-3 py-2">付费周期</th>
              <th className="px-3 py-2">返利金额</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-b-0">
                <td className="px-3 py-2">{r.invitedUsername}</td>
                <td className="px-3 py-2">{r.registerDate}</td>
                <td className="px-3 py-2">{r.planName}</td>
                <td className="px-3 py-2">{r.payCycle}</td>
                <td className="px-3 py-2">¥{r.rebateAmount}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="px-3 py-6 text-gray-500" colSpan={5}>暂无邀请购买记录</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
