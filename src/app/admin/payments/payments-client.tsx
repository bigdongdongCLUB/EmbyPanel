"use client";

import { useEffect, useState } from "react";

type Config = { mode: "test" | "live"; secretKey: string; webhookSecret: string; siteUrl: string; hasSecretKey?: boolean; hasWebhookSecret?: boolean };
type Method = { id: string; name: string; description: string; processor: "stripe"; priority: number; enabled: boolean; feeEnabled: boolean; feePercent: number; ready: boolean; config: Config };
type Form = Omit<Method, "ready">;
const blank = (): Form => ({ id: "", name: "Stripe", description: "银行卡及 Stripe 支持的支付方式", processor: "stripe", priority: 0, enabled: false, feeEnabled: false, feePercent: 0, config: { mode: "test", secretKey: "", webhookSecret: "", siteUrl: "" } });
const input = "mt-2 w-full min-w-0 rounded-xl border border-gray-200 bg-[#f8f9fa] px-3.5 py-3 text-sm outline-none focus:border-[#e3001b]";
const errors: Record<string, string> = {
  invalid_site_url: "面板地址需为 HTTPS 根地址；测试模式支持 http://localhost:3000",
  stripe_key_mode_mismatch: "密钥格式或模式不匹配，请检查 test / live 与密钥前缀",
  stripe_webhook_secret_required: "请填写以 whsec_ 开头的 Webhook 签名密钥",
  payment_settings_save_failed: "保存失败，请检查必填信息和服务器加密配置",
  payment_settings_unavailable: "无法读取支付配置，请检查服务器加密密钥",
};

export function PaymentsAdminClient() {
  const [items, setItems] = useState<Method[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [copied, setCopied] = useState("");
  async function refresh() {
    try {
      const response = await fetch("/api/admin/payments", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setItems(json.items ?? []);
    } catch (e) { setError(errors[e instanceof Error ? e.message : ""] ?? "支付配置加载失败"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  function edit(method?: Method) { setForm(method ? { ...method, config: { ...method.config } } : blank()); setStep(1); setError(""); setFeedback(""); }
  function config(change: Partial<Config>) { if (form) setForm({ ...form, config: { ...form.config, ...change } }); }
  async function save() {
    if (!form || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/payments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, config: { ...form.config, secretKey: form.config.secretKey.trim(), webhookSecret: form.config.webhookSecret.trim(), siteUrl: form.config.siteUrl.trim() } }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setForm(null); await refresh();
    } catch (e) { setError(errors[e instanceof Error ? e.message : ""] ?? "保存失败，请稍后重试"); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    const confirm = (window as unknown as { showConfirm: (text: string) => Promise<boolean> }).showConfirm;
    if (!(await confirm("删除此支付方式？已有订单的支付回调仍会继续处理。"))) return;
    const response = await fetch(`/api/admin/payments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) { setError("删除失败，请稍后重试"); return; }
    await refresh();
  }
  async function testConnection(id: string) {
    setBusy(true); setFeedback("");
    try {
      const response = await fetch(`/api/admin/payments/${id}/test`, { method: "POST" });
      if (!response.ok) throw new Error();
      setFeedback("API 密钥验证通过。请继续在 Stripe 后台确认 Webhook 投递成功，以及所需支付方式已启用。");
    } catch { setFeedback("连接失败：请检查密钥、网络与 Checkout Sessions 读写权限。"); }
    finally { setBusy(false); }
  }
  const visible = items.filter((m) => `${m.name} ${m.description}`.toLowerCase().includes(query.toLowerCase()));
  const webhook = form?.id && form.config.siteUrl ? `${form.config.siteUrl.replace(/\/$/, "")}/api/payments/stripe/webhook/${form.id}` : "保存后生成专属回调地址";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold">支付管理</h1><p className="mt-1 text-sm text-gray-500">通过 Stripe 托管收银台收款，保留账户余额支付。</p></div>
        <button className="rounded-xl bg-[#e3001b] px-4 py-2.5 text-sm font-medium text-white" onClick={() => edit()}>添加支付方式</button>
      </div>
      <div className="rounded-2xl border border-[#f0dfe2] bg-[#fff7f8] p-5 text-sm leading-6 text-gray-600">
        <strong className="text-[#222]">只需配置 Stripe</strong><p>银行卡、支付宝等方式由 Stripe 收银台动态展示。请先在 Stripe 后台启用所需方式，实际可用性取决于账户地区和收款资格。购买服务为单次付款，不自动续费。</p>
      </div>
      {error && !form ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {feedback && !form ? <p role="status" className="rounded-xl border bg-white p-4 text-sm">{feedback}</p> : null}
      <input className="w-full max-w-sm rounded-xl border bg-white px-4 py-2.5 text-sm" aria-label="搜索支付方式" placeholder="搜索支付方式名称或描述" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[740px] text-left text-sm">
          <thead className="border-b bg-gray-50 text-gray-500"><tr>{["支付方式", "运行模式", "配置状态", "手续费", "优先级", "操作"].map((label) => <th key={label} className="px-5 py-4 font-medium">{label}</th>)}</tr></thead>
          <tbody>{visible.map((m) => <tr key={m.id} className="border-b last:border-0">
            <td className="px-5 py-4"><div className="font-semibold">{m.name}</div><div className="mt-1 max-w-xs break-words text-xs text-gray-500">{m.description}</div></td>
            <td className="px-5 py-4">{m.config.mode === "test" ? "测试模式" : "正式收款"}</td>
            <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${m.enabled && m.ready ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>{!m.ready ? "待补齐配置" : m.enabled ? "已启用" : "已停用"}</span></td>
            <td className="px-5 py-4">{m.feeEnabled ? `${m.feePercent}%` : "不收取"}</td><td className="px-5 py-4">{m.priority}</td>
            <td className="px-5 py-4"><div className="flex gap-3 whitespace-nowrap"><button className="text-[#e3001b]" onClick={() => edit(m)}>编辑</button><button disabled={busy || !m.ready} className="disabled:opacity-40" onClick={() => testConnection(m.id)}>测试连接</button><button className="text-gray-500" onClick={() => remove(m.id)}>删除</button></div></td>
          </tr>)}</tbody>
        </table>{loading || !visible.length ? <p className="p-10 text-center text-sm text-gray-400">{loading ? "加载中..." : "暂无 Stripe 支付方式"}</p> : null}
      </div>
      {form ? <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm sm:p-6">
        <section role="dialog" aria-modal="true" aria-label="配置 Stripe 支付" className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
          <header className="border-b px-6 py-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{form.id ? "编辑支付方式" : "添加支付方式"}</h2><button aria-label="关闭" disabled={busy} onClick={() => setForm(null)}>×</button></div><div className="mt-5 flex gap-6 text-sm"><button onClick={() => setStep(1)} className={step === 1 ? "font-semibold text-[#e3001b]" : "text-gray-400"}>1. 基本信息</button><button onClick={() => setStep(2)} className={step === 2 ? "font-semibold text-[#e3001b]" : "text-gray-400"}>2. Stripe 配置</button></div></header>
          <div className="space-y-5 overflow-y-auto p-6">
            {step === 1 ? <>
              <label className="block text-sm">支付方式名称<input className={input} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label className="block text-sm">支付处理器<select className={input} value="stripe" onChange={() => {}}><option value="stripe">Stripe</option></select></label>
              <label className="block text-sm">描述<textarea className={input} value={form.description} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">优先级<input type="number" min={0} max={9999} className={input} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></label><label className="text-sm">手续费（%）<input type="number" min={0} max={100} step="0.01" disabled={!form.feeEnabled} className={input} value={form.feePercent} onChange={(e) => setForm({ ...form, feePercent: Number(e.target.value) })} /></label></div>
              <div className="flex flex-wrap gap-6 text-sm"><label><input type="checkbox" className="mr-2 accent-[#e3001b]" checked={form.feeEnabled} onChange={(e) => setForm({ ...form, feeEnabled: e.target.checked })} />收取手续费</label><label><input type="checkbox" className="mr-2 accent-[#e3001b]" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />启用此支付方式</label></div>
            </> : <>
              <label className="block text-sm">运行模式<select className={input} value={form.config.mode} onChange={(e) => config({ mode: e.target.value as Config["mode"] })}><option value="test">测试模式 · 不真实扣款</option><option value="live">正式模式 · 真实收款</option></select></label>
              <label className="block text-sm">服务端 API 密钥 <span className="text-red-600">*</span><input type="password" autoComplete="new-password" className={input} value={form.config.secretKey} onChange={(e) => config({ secretKey: e.target.value })} placeholder={form.config.hasSecretKey ? "已配置，留空保留原密钥" : "rk_test_... / sk_test_..."} /><span className="mt-2 block text-xs leading-5 text-gray-500">建议使用受限密钥（rk_），授予 Checkout Sessions 所需读写权限；也支持 Secret Key（sk_）。密钥仅加密保存在服务端。</span></label>
              <label className="block text-sm">面板公网地址 <span className="text-red-600">*</span><input type="url" className={input} value={form.config.siteUrl} onChange={(e) => config({ siteUrl: e.target.value })} placeholder="https://panel.example.com" /><span className="mt-2 block text-xs text-gray-500">正式模式必须使用 HTTPS，不带路径。用于支付返回与 Webhook 地址。</span></label>
              <div className="rounded-xl border bg-gray-50 p-4 text-sm"><strong>Webhook 回调地址</strong><p className="mt-2 break-all font-mono text-xs leading-5">{webhook}</p>{form.id && form.config.siteUrl ? <button className="mt-2 text-xs text-[#e3001b]" onClick={async () => { try { await navigator.clipboard.writeText(webhook); setCopied(webhook); } catch { setCopied("failed"); } }}>{copied === webhook ? "已复制" : copied === "failed" ? "复制失败" : "复制地址"}</button> : null}<p className="mt-3 text-xs leading-5 text-gray-500">首次配置可先保存为停用状态，复制地址后在 Stripe Workbench 添加事件目标。必须订阅：</p><ul className="mt-1 break-all font-mono text-xs leading-5"><li>checkout.session.completed</li><li>checkout.session.async_payment_succeeded</li><li>checkout.session.async_payment_failed</li><li>checkout.session.expired</li></ul></div>
              <label className="block text-sm">Webhook 签名密钥 <span className="text-red-600">{form.enabled ? "*" : "（启用时必填）"}</span><input type="password" autoComplete="new-password" className={input} value={form.config.webhookSecret} onChange={(e) => config({ webhookSecret: e.target.value })} placeholder={form.config.hasWebhookSecret ? "已配置，留空保留原密钥" : "whsec_..."} /><span className="mt-2 block text-xs leading-5 text-gray-500">从上述事件目标中获取，不是 API 密钥。测试与正式环境的签名密钥不可混用。</span></label>
              <p className="rounded-xl bg-[#fff7f8] p-4 text-xs leading-5 text-gray-600">使用 Stripe 托管收银台，无需填写 Publishable Key（pk_）。首次配置请先使用测试模式，验证支付与回调后再开启正式模式。</p>
            </>}
            {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
          </div>
          <footer className="flex justify-end gap-3 border-t px-6 py-4"><button disabled={busy} className="rounded-xl border px-5 py-2.5 text-sm" onClick={() => step === 2 ? setStep(1) : setForm(null)}>{step === 2 ? "上一步" : "取消"}</button><button disabled={busy || !form.name.trim()} className="rounded-xl bg-[#e3001b] px-5 py-2.5 text-sm text-white disabled:opacity-50" onClick={() => step === 1 ? setStep(2) : save()}>{busy ? "保存中..." : step === 1 ? "下一步" : "保存配置"}</button></footer>
        </section>
      </div> : null}
    </div>
  );
}
