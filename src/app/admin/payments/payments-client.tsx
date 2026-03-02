"use client";

import { useEffect, useMemo, useState } from "react";

type Processor = "epay" | "stripe";

type PaymentMethod = {
  id: string;
  name: string;
  description: string;
  processor: Processor;
  iconType: "preset" | "none";
  presetIcon: string;
  priority: number;
  feeEnabled: boolean;
  feePercent: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  config: any;
};

type Step = 1 | 2;

const emptyForm = {
  id: "",
  name: "",
  description: "",
  processor: "" as "" | Processor,
  iconType: "preset" as "preset" | "none",
  presetIcon: "wallet",
  priority: 0,
  feeEnabled: false,
  feePercent: 0,
  enabled: true,
  config: {
    merchantId: "",
    merchantKey: "",
    apiBaseUrl: "",
    paymentType: "alipay",
    signType: "MD5",
    sandbox: false,
    secretKey: "",
    webhookSecret: "",
    publishableKey: "",
  },
};

function feeText(x: PaymentMethod) {
  return x.feeEnabled ? `${x.feePercent}%` : "不收取";
}

export function PaymentsAdminClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PaymentMethod[]>([]);
  const [q, setQ] = useState("");

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
      setItems(Array.isArray(json?.items) ? json.items : []);
    } catch (e: any) {
      setError(e?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((x) => `${x.name} ${x.description}`.toLowerCase().includes(qq));
  }, [items, q]);

  function openCreate() {
    setForm({ ...emptyForm });
    setStep(1);
    setOpen(true);
  }

  function openEdit(x: PaymentMethod) {
    setForm({
      ...emptyForm,
      ...x,
      processor: x.processor,
      config: { ...emptyForm.config, ...(x.config || {}) },
    });
    setStep(1);
    setOpen(true);
  }

  function validateStep2() {
    if (form.processor === "epay") {
      return !!form.config.merchantId && !!form.config.merchantKey && !!form.config.apiBaseUrl && !!form.config.paymentType && !!form.config.signType;
    }
    if (form.processor === "stripe") {
      return !!form.config.secretKey && !!form.config.webhookSecret;
    }
    return false;
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        id: form.id || undefined,
        name: String(form.name || "").trim(),
        description: String(form.description || "").trim(),
        processor: form.processor,
        iconType: form.iconType,
        presetIcon: form.presetIcon,
        priority: Number(form.priority || 0),
        feeEnabled: !!form.feeEnabled,
        feePercent: Number(form.feePercent || 0),
        enabled: !!form.enabled,
      };
      if (form.processor === "epay") {
        payload.config = {
          merchantId: String(form.config.merchantId || "").trim(),
          merchantKey: String(form.config.merchantKey || "").trim(),
          apiBaseUrl: String(form.config.apiBaseUrl || "").trim(),
          paymentType: form.config.paymentType || "alipay",
          signType: form.config.signType || "MD5",
          sandbox: !!form.config.sandbox,
        };
      } else {
        payload.config = {
          secretKey: String(form.config.secretKey || "").trim(),
          webhookSecret: String(form.config.webhookSecret || "").trim(),
          publishableKey: String(form.config.publishableKey || "").trim(),
        };
      }

      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);

      setOpen(false);
      await refresh();
    } catch (e: any) {
      alert(e?.message ?? "save_failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(id: string) {
    if (!(await (window as any).showConfirm("确认删除该支付方式？"))) return;
    const res = await fetch(`/api/admin/payments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok) return alert(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">支付管理</h1>

      <div className="flex items-center justify-between gap-2">
        <input className="border rounded px-3 py-2 w-full max-w-xs" placeholder="搜索支付方式名称或描述" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="bg-[#e3001b] text-white rounded px-3 py-2" onClick={openCreate}>+ 添加支付方式</button>
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="border rounded-lg overflow-auto bg-white">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="text-left text-gray-600 border-b bg-gray-50">
            <tr>
              <th className="py-2 px-3">名称</th>
              <th className="py-2 px-3">描述</th>
              <th className="py-2 px-3">手续费</th>
              <th className="py-2 px-3">优先级</th>
              <th className="py-2 px-3">状态</th>
              <th className="py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((x) => (
              <tr key={x.id} className="border-b">
                <td className="py-2 px-3 font-medium">{x.name}</td>
                <td className="py-2 px-3 text-gray-600">{x.description || "-"}</td>
                <td className="py-2 px-3">{feeText(x)}</td>
                <td className="py-2 px-3">{x.priority}</td>
                <td className="py-2 px-3">{x.enabled ? "启用" : "停用"}</td>
                <td className="py-2 px-3">
                  <div className="flex gap-2">
                    <button className="border rounded px-2 py-1" onClick={() => openEdit(x)}>编辑</button>
                    <button className="border rounded px-2 py-1 text-red-600" onClick={() => removeItem(x.id)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-400">No data</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-40">
          <div className="bg-white w-full max-w-[520px] rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.08)] max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-8 pt-8 pb-4">
              <div className="text-[24px] leading-none font-bold text-[#222]">添加支付方式</div>

              <div className="mt-6 flex gap-6 border-b border-[#eaeaea]">
                <button className={`pb-3 text-[13px] relative ${step === 1 ? "text-[#e3001b] font-bold" : "text-[#888] hover:text-[#222]"}`} onClick={() => setStep(1)}>
                  基本信息
                  {step === 1 ? <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#e3001b]" /> : null}
                </button>
                <button className={`pb-3 text-[13px] relative ${step === 2 ? "text-[#e3001b] font-bold" : "text-[#888] hover:text-[#222] disabled:text-gray-300"}`} disabled={!form.processor} onClick={() => setStep(2)}>
                  配置信息
                  {step === 2 ? <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#e3001b]" /> : null}
                </button>
              </div>
            </div>

            <div className="px-8 py-6 overflow-y-auto max-h-[60vh]">
            {step === 1 ? (
              <div className="space-y-5">
                <div>
                  <label className="text-[13px] text-[#222]">支付方式名称</label>
                  <input className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" placeholder="请输入支付方式名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-[13px] text-[#222]"><span className="text-[#e3001b] mr-1">*</span>支付处理器</label>
                  <select className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" value={form.processor} onChange={(e) => setForm({ ...form, processor: e.target.value })}>
                    <option value="">请选择支付处理器</option>
                    <option value="epay">易支付</option>
                    <option value="stripe">Stripe</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] text-[#222]">描述</label>
                  <textarea className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 min-h-[90px] text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" placeholder="请输入支付方式描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[13px]">优先级</label>
                    <input className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" value={String(form.priority)} onChange={(e) => setForm({ ...form, priority: Number(e.target.value || 0) })} />
                  </div>
                  <div>
                    <label className="text-[13px]">手续费(%)</label>
                    <input className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" value={String(form.feePercent)} onChange={(e) => setForm({ ...form, feePercent: Number(e.target.value || 0) })} />
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <label className="flex items-center gap-2 text-[13px] text-[#222]"><input className="h-4 w-4 accent-[#e3001b]" type="checkbox" checked={form.feeEnabled} onChange={(e) => setForm({ ...form, feeEnabled: e.target.checked })} /> 收取手续费</label>
                  <label className="flex items-center gap-2 text-[13px] text-[#222]"><input className="h-4 w-4 accent-[#e3001b]" type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> 启用</label>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {form.processor === "epay" ? (
                  <>
                    <div>
                      <label className="text-[13px] text-[#222]"><span className="text-[#e3001b] mr-1">*</span>商户ID（pid）</label>
                      <input className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" placeholder="请输入商户ID" value={form.config.merchantId} onChange={(e) => setForm({ ...form, config: { ...form.config, merchantId: e.target.value } })} />
                    </div>
                    <div>
                      <label className="text-[13px] text-[#222]"><span className="text-[#e3001b] mr-1">*</span>商户密钥（key）</label>
                      <input className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" placeholder="请输入商户密钥" value={form.config.merchantKey} onChange={(e) => setForm({ ...form, config: { ...form.config, merchantKey: e.target.value } })} />
                    </div>
                    <div>
                      <label className="text-[13px] text-[#222]"><span className="text-[#e3001b] mr-1">*</span>接口地址（submit.php 所在域名）</label>
                      <input className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" placeholder="https://pay.example.com" value={form.config.apiBaseUrl} onChange={(e) => setForm({ ...form, config: { ...form.config, apiBaseUrl: e.target.value } })} />
                    </div>
                    <div>
                      <label className="text-[13px] text-[#222]"><span className="text-[#e3001b] mr-1">*</span>支付类型（type）</label>
                      <select className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" value={form.config.paymentType} onChange={(e) => setForm({ ...form, config: { ...form.config, paymentType: e.target.value } })}>
                        <option value="alipay">alipay</option>
                        <option value="wxpay">wxpay</option>
                        <option value="qqpay">qqpay</option>
                        <option value="bank">bank</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[13px] text-[#222]"><span className="text-[#e3001b] mr-1">*</span>签名方式（sign_type）</label>
                      <select className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" value={form.config.signType} onChange={(e) => setForm({ ...form, config: { ...form.config, signType: e.target.value } })}>
                        <option value="MD5">MD5</option>
                        <option value="HMAC-SHA256">HMAC-SHA256</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-[13px] text-[#222]"><input className="h-4 w-4 accent-[#e3001b]" type="checkbox" checked={!!form.config.sandbox} onChange={(e) => setForm({ ...form, config: { ...form.config, sandbox: e.target.checked } })} /> 调试模式</label>
                  </>
                ) : form.processor === "stripe" ? (
                  <>
                    <div>
                      <label className="text-[13px] text-[#222]"><span className="text-[#e3001b] mr-1">*</span>Secret Key</label>
                      <input className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" placeholder="sk_live_..." value={form.config.secretKey} onChange={(e) => setForm({ ...form, config: { ...form.config, secretKey: e.target.value } })} />
                    </div>
                    <div>
                      <label className="text-[13px] text-[#222]"><span className="text-[#e3001b] mr-1">*</span>Webhook Secret</label>
                      <input className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" placeholder="whsec_..." value={form.config.webhookSecret} onChange={(e) => setForm({ ...form, config: { ...form.config, webhookSecret: e.target.value } })} />
                    </div>
                    <div>
                      <label className="text-[13px]">Publishable Key（可选）</label>
                      <input className="mt-2 w-full border border-[#eaeaea] rounded-[10px] px-3.5 py-3 text-[13px] outline-none focus:border-[#e3001b] focus:ring-4 focus:ring-[rgba(227,0,27,0.05)]" placeholder="pk_live_..." value={form.config.publishableKey} onChange={(e) => setForm({ ...form, config: { ...form.config, publishableKey: e.target.value } })} />
                    </div>
                  </>
                ) : (
                  <div className="text-[13px] text-gray-500">请先在基本信息中选择支付处理器</div>
                )}
              </div>
            )}

            </div>

            <div className="px-8 pb-8 pt-4 flex justify-end gap-3">
              <button className="px-6 py-2.5 rounded-md border border-[#eaeaea] bg-white text-[#222] text-[13px] font-bold hover:bg-[#f8f9fa]" onClick={() => setOpen(false)}>取消</button>
              {step === 1 ? (
                <button className="px-6 py-2.5 rounded-md bg-[#e3001b] hover:bg-[#c20017] text-white text-[13px] font-bold disabled:opacity-50" disabled={!form.processor} onClick={() => setStep(2)}>下一步</button>
              ) : (
                <button className="px-6 py-2.5 rounded-md bg-[#e3001b] hover:bg-[#c20017] text-white text-[13px] font-bold disabled:opacity-50" disabled={saving || !validateStep2()} onClick={submit}>{saving ? "保存中..." : "创建"}</button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
