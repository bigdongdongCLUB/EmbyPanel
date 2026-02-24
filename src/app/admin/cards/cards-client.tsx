"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  code: string;
  type: "BALANCE" | "SUBSCRIPTION";
  status: "UNUSED" | "USED" | "DISABLED";
  amountCents: number | null;
  payCycle: string | null;
  subscriptionDays: number | null;
  note: string | null;
  createdAt: string;
  usedAt: string | null;
  plan: { id: string; name: string } | null;
};

type Plan = { id: string; name: string };

function fmt(v?: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

async function copyTextSafe(text: string) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}

export function CardCodesClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState({ total: 0, used: 0, balanceTotal: 0, subTotal: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [createdCodes, setCreatedCodes] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [count, setCount] = useState("10");
  const [createType, setCreateType] = useState<"BALANCE" | "SUBSCRIPTION">("BALANCE");
  const [amountYuan, setAmountYuan] = useState("100");
  const [planId, setPlanId] = useState("");
  const [payCycle, setPayCycle] = useState("YEARLY");
  const [subscriptionDays, setSubscriptionDays] = useState("");
  const [note, setNote] = useState("");

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  const canCreate = useMemo(() => {
    const c = Number(count);
    if (!Number.isFinite(c) || c < 1) return false;
    if (createType === "BALANCE") {
      const n = Number(amountYuan);
      return Number.isFinite(n) && n > 0;
    }
    return !!planId;
  }, [count, createType, amountYuan, planId]);

  const allSelected = rows.length > 0 && rows.every((r) => !!selected[r.id]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(window.location.origin + "/api/admin/card-codes");
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (type) url.searchParams.set("type", type);
      if (status) url.searchParams.set("status", status);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const txt = await res.text();
      let json: any = null;
      try {
        json = txt ? JSON.parse(txt) : null;
      } catch {
        json = null;
      }
      if (!res.ok) throw new Error(json?.message || json?.error || txt || `HTTP ${res.status}`);
      const nextRows = json.rows || [];
      setRows(nextRows);
      setSelected((m) => {
        const valid = new Set(nextRows.map((r: any) => r.id));
        const out: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(m)) if (v && valid.has(k)) out[k] = true;
        return out;
      });
      setPlans(json.plans || []);
      setSummary(json.summary || { total: 0, used: 0, balanceTotal: 0, subTotal: 0 });
    } catch (e: any) {
      setError(e?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type, status]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border rounded p-3"><div className="text-xs text-gray-500">卡密总数</div><div className="text-2xl text-blue-600">{summary.total}</div></div>
        <div className="border rounded p-3"><div className="text-xs text-gray-500">已使用</div><div className="text-2xl text-red-600">{summary.used}</div></div>
        <div className="border rounded p-3"><div className="text-xs text-gray-500">余额卡密总数</div><div className="text-2xl text-green-600">{summary.balanceTotal}</div></div>
        <div className="border rounded p-3"><div className="text-xs text-gray-500">订阅卡密总数</div><div className="text-2xl text-purple-600">{summary.subTotal}</div></div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-2">
        <input className="w-full md:w-72 h-7 border rounded px-3 text-xs" placeholder="搜索卡密/备注" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="h-7 border rounded px-3 text-xs" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">全部类型</option>
          <option value="BALANCE">余额卡密</option>
          <option value="SUBSCRIPTION">订阅卡密</option>
        </select>
        <select className="h-7 border rounded px-3 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="UNUSED">未使用</option>
          <option value="USED">已使用</option>
          <option value="DISABLED">已禁用</option>
        </select>
        <button className="h-7 border rounded px-3 text-xs" onClick={refresh} disabled={loading}>刷新</button>
        <button className="h-7 bg-blue-600 text-white rounded px-3 text-xs ml-auto" onClick={() => setOpen(true)}>创建卡密</button>
        <details className="relative">
          <summary className="list-none h-7 border rounded px-3 text-xs cursor-pointer select-none flex items-center">更多</summary>
          <div className="absolute right-0 mt-2 w-44 bg-white border rounded shadow z-20 p-1 text-sm">
            <button
              className="w-full text-left px-2 py-1.5 hover:bg-gray-50 disabled:opacity-50"
              disabled={!selectedIds.length}
              onClick={async () => {
                const codes = rows.filter((r) => selected[r.id]).map((r) => r.code).join("\n");
                const ok = await copyTextSafe(codes);
                if (!ok) alert("复制失败，请手动复制");
                else showToast(`已复制 ${selectedIds.length} 个卡密`);
              }}
            >
              复制选中卡密
            </button>
            <button
              className="w-full text-left px-2 py-1.5 hover:bg-gray-50 text-red-600 disabled:opacity-50"
              disabled={!selectedIds.length}
              onClick={async () => {
                if (!(await (window as any).showConfirm(`确认批量删除 ${selectedIds.length} 个卡密？`))) return;
                for (const id of selectedIds) {
                  await fetch(`/api/admin/card-codes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
                }
                setSelected({});
                await refresh();
              }}
            >
              批量删除
            </button>
          </div>
        </details>
      </div>

      <div className="border rounded overflow-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="border-b text-left text-gray-600">
            <tr>
              <th className="px-3 py-2 w-10"><input type="checkbox" checked={allSelected} onChange={(e) => {
                const v = e.target.checked;
                if (!v) { setSelected({}); return; }
                const next: Record<string, boolean> = {};
                for (const r of rows) next[r.id] = true;
                setSelected(next);
              }} /></th><th className="px-3 py-2">卡密</th><th className="px-3 py-2">类型</th><th className="px-3 py-2">内容</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">使用时间</th><th className="px-3 py-2">创建时间</th><th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2"><input type="checkbox" checked={!!selected[r.id]} onChange={(e) => setSelected((m) => ({ ...m, [r.id]: e.target.checked }))} /></td>
                <td className="px-3 py-2 font-mono">{r.code}</td>
                <td className="px-3 py-2">
                  {r.type === "BALANCE" ? (
                    <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 text-green-700 px-2.5 py-0.5 text-xs font-medium">余额卡密</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 px-2.5 py-0.5 text-xs font-medium">订阅卡密</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.type === "BALANCE" ? `充值 ¥${((r.amountCents || 0) / 100).toFixed(0)}` : `${r.plan?.name || "-"} / ${r.subscriptionDays || 0} 天 / ${r.payCycle || "-"}`}
                </td>
                                <td className="px-3 py-2">
                                  {r.status === "UNUSED" ? (
                                    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 px-2.5 py-0.5 text-xs font-medium">未使用</span>
                                  ) : r.status === "USED" ? (
                                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 px-2.5 py-0.5 text-xs font-medium">已使用</span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 text-red-600 px-2.5 py-0.5 text-xs font-medium">已禁用</span>
                                  )}
                                </td>
                <td className="px-3 py-2">{fmt(r.usedAt)}</td>
                <td className="px-3 py-2">{fmt(r.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3 text-sm">
                    <button
                      className="text-gray-700 hover:text-black"
                      onClick={async () => {
                        const ok = await copyTextSafe(r.code);
                        if (!ok) alert("复制失败，请手动复制");
                        else showToast("已复制卡密");
                      }}
                    >
                      复制卡密
                    </button>
                    <button
                      className="text-red-600 hover:text-red-700"
                      onClick={async () => {
                        if (!(await (window as any).showConfirm("确认删除该卡密？"))) return;
                        const res = await fetch(`/api/admin/card-codes?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
                        const txt = await res.text();
                        let json: any = null;
                        try { json = txt ? JSON.parse(txt) : null; } catch { json = null; }
                        if (!res.ok) {
                          alert(json?.message || json?.error || txt || `HTTP ${res.status}`);
                          return;
                        }
                        await refresh();
                      }}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? <tr><td className="px-3 py-6 text-gray-500" colSpan={8}>暂无数据</td></tr> : null}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-[470px] p-4 space-y-4 max-h-[85vh] overflow-auto">
            <div className="text-xl font-semibold">批量创建卡密</div>
            <div className="rounded-lg border bg-blue-50 p-4 text-sm text-gray-700">支持生成余额充值卡密和订阅卡密。卡密默认16位大写英文+数字。</div>

            <div>
              <label className="text-sm">* 生成数量</label>
              <input className="mt-1 w-full border rounded px-3 py-2" value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
            <div>
              <label className="text-sm">* 卡密类型</label>
              <select className="mt-1 w-full border rounded px-3 py-2" value={createType} onChange={(e) => setCreateType(e.target.value as any)}>
                <option value="BALANCE">余额卡密</option>
                <option value="SUBSCRIPTION">订阅卡密</option>
              </select>
            </div>

            {createType === "BALANCE" ? (
              <div>
                <label className="text-sm">* 充值金额（元）</label>
                <input className="mt-1 w-full border rounded px-3 py-2" value={amountYuan} onChange={(e) => setAmountYuan(e.target.value)} />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm">* 订阅计划</label>
                  <select className="mt-1 w-full border rounded px-3 py-2" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                    <option value="">选择计划…</option>
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm">订阅周期</label>
                  <select className="mt-1 w-full border rounded px-3 py-2" value={payCycle} onChange={(e) => setPayCycle(e.target.value)}>
                    <option value="MONTHLY">月付（30天）</option>
                    <option value="QUARTERLY">季付（90天）</option>
                    <option value="HALF_YEARLY">半年付（180天）</option>
                    <option value="YEARLY">年付（365天）</option>
                    <option value="TWO_YEARLY">两年付（730天）</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm">订阅天数（选填，优先级更高）</label>
                  <input className="mt-1 w-full border rounded px-3 py-2" value={subscriptionDays} onChange={(e) => setSubscriptionDays(e.target.value)} />
                </div>
              </>
            )}

            <div>
                          </div>
            <div>
              <label className="text-sm">备注</label>
              <textarea className="mt-1 w-full border rounded px-3 py-2 min-h-[100px]" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2">
              <button className="border bg-white rounded px-4 py-2" onClick={() => setOpen(false)}>取消</button>
              <button
                className="bg-gray-700 text-white rounded px-4 py-2 disabled:opacity-50"
                disabled={!canCreate}
                onClick={async () => {
                  const payload: any = {
                    count: Number(count),
                    type: createType,
                    amountYuan: createType === "BALANCE" ? Number(amountYuan) : undefined,
                    planId: createType === "SUBSCRIPTION" ? planId : undefined,
                    payCycle: createType === "SUBSCRIPTION" ? payCycle : undefined,
                    subscriptionDays: createType === "SUBSCRIPTION" && subscriptionDays.trim() ? Number(subscriptionDays) : undefined,
                    note: note.trim() || undefined,
                  };
                  const res = await fetch('/api/admin/card-codes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
                  const txt = await res.text();
                  let json: any = null;
                  try { json = txt ? JSON.parse(txt) : null; } catch { json = null; }
                  if (!res.ok) { alert(json?.error || txt || `HTTP ${res.status}`); return; }
                  setCreatedCodes(Array.isArray(json?.preview) ? json.preview : []);
                  setOpen(false);
                  setResultOpen(true);
                  await refresh();
                }}
              >生成</button>
            </div>
          </div>
        </div>
      ) : null}

      {resultOpen ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl p-4 space-y-4 max-h-[85vh] overflow-auto">
            <div className="text-2xl font-semibold">批量创建卡密</div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="text-2xl font-semibold text-green-700">已生成 {createdCodes.length} 个卡密</div>
              <div className="text-sm text-gray-700 mt-2">请及时复制，卡密仅显示一次。</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="bg-blue-600 text-white rounded px-4 py-2"
                onClick={async () => {
                  const all = createdCodes.join("\n");
                  const ok = await copyTextSafe(all);
                  if (!ok) alert("复制失败，请手动复制");
                  else showToast("已复制生成的卡密");
                }}
              >
                复制全部
              </button>
              <button className="border rounded px-4 py-2" onClick={() => { setResultOpen(false); setOpen(true); }}>
                再次生成
              </button>
            </div>

            <div className="border rounded overflow-hidden">
              {createdCodes.map((c) => (
                <div key={c} className="px-4 py-3 border-b last:border-b-0 font-mono text-xl font-semibold">
                  {c}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button className="border rounded px-4 py-2" onClick={() => setResultOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[80] rounded-xl bg-white text-gray-900 text-sm px-5 py-3 shadow-xl border flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-xs">✓</span>
          <span>{toast}</span>
        </div>
      ) : null}
    </div>
  );
}
