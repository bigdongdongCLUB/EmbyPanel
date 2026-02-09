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
  batchTag: string | null;
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

export function CardCodesClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState({ total: 0, used: 0, balanceTotal: 0, subTotal: 0 });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const [count, setCount] = useState("10");
  const [createType, setCreateType] = useState<"BALANCE" | "SUBSCRIPTION">("BALANCE");
  const [amountYuan, setAmountYuan] = useState("100");
  const [planId, setPlanId] = useState("");
  const [payCycle, setPayCycle] = useState("YEARLY");
  const [subscriptionDays, setSubscriptionDays] = useState("");
  const [batchTag, setBatchTag] = useState("");
  const [note, setNote] = useState("");

  const canCreate = useMemo(() => {
    const c = Number(count);
    if (!Number.isFinite(c) || c < 1) return false;
    if (createType === "BALANCE") {
      const n = Number(amountYuan);
      return Number.isFinite(n) && n > 0;
    }
    return !!planId;
  }, [count, createType, amountYuan, planId]);

  async function refresh() {
    setLoading(true);
    try {
      const url = new URL(window.location.origin + "/api/admin/card-codes");
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (type) url.searchParams.set("type", type);
      if (status) url.searchParams.set("status", status);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setRows(json.rows || []);
      setPlans(json.plans || []);
      setSummary(json.summary || { total: 0, used: 0, balanceTotal: 0, subTotal: 0 });
    } catch (e: any) {
      alert(e?.message || "加载失败");
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

      <div className="flex flex-wrap gap-2">
        <input className="border rounded px-3 py-2" placeholder="搜索卡密/批次/备注" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="border rounded px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">全部类型</option>
          <option value="BALANCE">余额卡密</option>
          <option value="SUBSCRIPTION">订阅卡密</option>
        </select>
        <select className="border rounded px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="UNUSED">未使用</option>
          <option value="USED">已使用</option>
          <option value="DISABLED">已禁用</option>
        </select>
        <button className="border rounded px-3 py-2" onClick={refresh} disabled={loading}>刷新</button>
        <button className="bg-blue-600 text-white rounded px-3 py-2 ml-auto" onClick={() => setOpen(true)}>创建卡密</button>
      </div>

      <div className="border rounded overflow-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="border-b text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">卡密</th><th className="px-3 py-2">类型</th><th className="px-3 py-2">内容</th><th className="px-3 py-2">批次</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">使用时间</th><th className="px-3 py-2">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2 font-mono">{r.code}</td>
                <td className="px-3 py-2">{r.type === "BALANCE" ? "余额卡密" : "订阅卡密"}</td>
                <td className="px-3 py-2 text-xs">
                  {r.type === "BALANCE" ? `充值 ¥${((r.amountCents || 0) / 100).toFixed(0)}` : `${r.plan?.name || "-"} / ${r.subscriptionDays || 0} 天 / ${r.payCycle || "-"}`}
                </td>
                <td className="px-3 py-2">{r.batchTag || "-"}</td>
                <td className="px-3 py-2">{r.status === "UNUSED" ? "未使用" : r.status === "USED" ? "已使用" : "已禁用"}</td>
                <td className="px-3 py-2">{fmt(r.usedAt)}</td>
                <td className="px-3 py-2">{fmt(r.createdAt)}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td className="px-3 py-6 text-gray-500" colSpan={7}>暂无数据</td></tr> : null}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl p-4 space-y-4 max-h-[85vh] overflow-auto">
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
              <label className="text-sm">批次标签</label>
              <input className="mt-1 w-full border rounded px-3 py-2" value={batchTag} onChange={(e) => setBatchTag(e.target.value)} placeholder="例如：2025Q4促销" />
            </div>
            <div>
              <label className="text-sm">备注</label>
              <textarea className="mt-1 w-full border rounded px-3 py-2 min-h-[100px]" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2">
              <button className="border rounded px-4 py-2" onClick={() => setOpen(false)}>取消</button>
              <button
                className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
                disabled={!canCreate}
                onClick={async () => {
                  const payload: any = {
                    count: Number(count),
                    type: createType,
                    amountYuan: createType === "BALANCE" ? Number(amountYuan) : undefined,
                    planId: createType === "SUBSCRIPTION" ? planId : undefined,
                    payCycle: createType === "SUBSCRIPTION" ? payCycle : undefined,
                    subscriptionDays: createType === "SUBSCRIPTION" && subscriptionDays.trim() ? Number(subscriptionDays) : undefined,
                    batchTag: batchTag.trim() || undefined,
                    note: note.trim() || undefined,
                  };
                  const res = await fetch('/api/admin/card-codes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
                  const json = await res.json().catch(() => null);
                  if (!res.ok) { alert(json?.error || `HTTP ${res.status}`); return; }
                  alert(`创建成功：${json?.created || 0} 个`);
                  setOpen(false);
                  await refresh();
                }}
              >生成</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
