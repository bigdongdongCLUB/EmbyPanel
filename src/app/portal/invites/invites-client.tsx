"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/pagination-bar";

type Row = {
  invitedUsername: string;
  registerDate: string;
  planName: string;
  payCycle: string;
  paidAt: string;
  rebateAmount: string;
};

type RebatePolicy = {
  enabled: boolean;
  mode: "LOOP" | "FIRST_ONLY";
  level: number;
  rate1: number;
  rate2: number;
  rate3: number;
};

export function InvitesClient() {
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [rebatePolicy, setRebatePolicy] = useState<RebatePolicy | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/invites", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setInviteCode(json.inviteCode || "");
      setRows(json.rows || []);
      setRebatePolicy(json.rebatePolicy || null);
      setPage(1);
    } catch (e: any) {
      alert(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [page, pageSize, rows]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="max-w-[1000px] mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-[#222]">我的邀请</h1>
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="relative bg-white border-2 border-[#e3001b] rounded-2xl p-8 shadow-[0_8px_24px_rgba(227,0,27,0.08)]">
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#e3001b] text-white text-xs font-bold px-4 py-1 rounded-full">专属邀请码</div>
        <div className="text-[15px] text-[#666] mb-4">分享您的邀请码给朋友，邀请他们加入</div>

        <div className="flex flex-col md:flex-row gap-4 md:items-stretch">
          <div
            className="flex-1 min-h-12 bg-[#f8f9fa] border border-[#eaeaea] rounded-lg flex items-center px-5 text-2xl font-mono font-bold text-[#e3001b] tracking-[0.12em] cursor-text"
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
            <span id="invite-code-text" className="truncate">{inviteCode || "-"}</span>
          </div>

          <button
            className="h-12 px-8 bg-[#e3001b] text-white rounded-lg text-[15px] font-bold hover:bg-[#c20017]"
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
            className="h-12 px-6 border border-[#eaeaea] bg-white text-[#222] rounded-lg text-[15px] hover:bg-[#f8f9fa]"
            onClick={async () => {
              const ok = await (window as any).showConfirm("确认重新生成邀请码？旧邀请码将失效。");
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

      {rebatePolicy?.enabled ? (
        <div className="bg-[#f4f5f7] rounded-2xl p-8">
          <div className="text-base font-bold mb-3 text-[#222]">返利计算示例</div>
          <div className="text-sm text-[#222] leading-8">
            <div>返利模式：{rebatePolicy?.mode === "FIRST_ONLY" ? "仅首次返利" : "循环返利"}；已开启</div>
            <div>假设被邀请用户购买 ¥300 订阅：</div>
            <ul className="list-disc pl-5 text-[#666] space-y-1">
              <li>一级邀请人：¥300 × {rebatePolicy?.rate1 ?? 0}% = ¥{(((rebatePolicy?.rate1 ?? 0) * 300) / 100).toFixed(2)}</li>
              {(rebatePolicy?.level ?? 1) >= 2 ? (
                <li>二级邀请人：¥300 × {rebatePolicy?.rate2 ?? 0}% = ¥{(((rebatePolicy?.rate2 ?? 0) * 300) / 100).toFixed(2)}</li>
              ) : null}
              {(rebatePolicy?.level ?? 1) >= 3 ? (
                <li>三级邀请人：¥300 × {rebatePolicy?.rate3 ?? 0}% = ¥{(((rebatePolicy?.rate3 ?? 0) * 300) / 100).toFixed(2)}</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : (
        <div className="bg-[#f4f5f7] rounded-2xl p-8">
          <div className="text-base font-bold mb-3 text-[#222]">返利说明</div>
          <div className="text-sm text-[#666] leading-relaxed">
            返利系统暂未开启，您的邀请记录仍会正常显示，但返利金额为 ¥0.00
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#eaeaea] overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-[760px] w-full text-sm text-left">
            <thead className="bg-[#f8f9fa] text-[#666] border-b border-[#eaeaea]">
              <tr>
                <th className="px-6 py-4 font-medium">邀请用户</th>
                <th className="px-6 py-4 font-medium">注册时间</th>
                <th className="px-6 py-4 font-medium">订阅计划</th>
                <th className="px-6 py-4 font-medium">付费周期</th>
                <th className="px-6 py-4 font-medium">返利金额</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r, i) => (
                <tr key={`${r.invitedUsername}-${r.registerDate}-${i}`} className="border-b border-[#eaeaea] last:border-b-0">
                  <td className="px-6 py-5 text-[#666]">{r.invitedUsername}</td>
                  <td className="px-6 py-5 text-[#666]">{r.registerDate}</td>
                  <td className="px-6 py-5 text-[#666]">{r.planName}</td>
                  <td className="px-6 py-5 text-[#666]">{r.payCycle}</td>
                  <td className="px-6 py-5 text-[#666]">¥{r.rebateAmount}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="px-6 py-16 text-center text-[#aaa]" colSpan={5}>暂无邀请购买记录</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {rows.length > 0 ? (
          <PaginationBar
            total={rows.length}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={() => {}}
            pageSizeOptions={[10]}
            showPageSize={false}
            compactSinglePage
            simpleGoto
          />
        ) : null}
      </div>
    </div>
  );
}
