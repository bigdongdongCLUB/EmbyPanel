"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type EmbyServer = { id: string; name: string; enabled: boolean };

type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  visible: boolean;
  serverAssignStrategy: "ALL" | "LOAD_BALANCE";
  pricingJson: any;
  serverConfigs: Array<{
    id: string;
    embyServerId: string;
    templateEmbyUserId: string;
    embyServer: { id: string; name: string };
  }>;
  subscriptionCount?: number;
  createdAt: string;
};

type EditState =
  | { open: false }
  | {
      open: true;
      id: string | null;
      loading: boolean;
      error: string | null;
      name: string;
      description: string;
      enabled: boolean;
      visible: boolean;
      serverAssignStrategy: "ALL" | "LOAD_BALANCE";
      // pricing (yuan string)
      trialPrice: string;
      trialDays: string;
      monthlyPrice: string;
      quarterlyPrice: string;
      halfYearlyPrice: string;
      yearlyPrice: string;
      twoYearlyPrice: string;
      servers: Array<{ embyServerId: string; templateEmbyUserId: string }>; // configs
    };

function yuanIntToCents(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  // 价格要求：人民币元（不设小数）
  if (!/^[0-9]+$/.test(s)) return NaN;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n * 100;
}

function centsToYuanInt(v: any): string {
  if (typeof v !== "number") return "";
  if (!Number.isFinite(v)) return "";
  return String(Math.round(v / 100));
}

export function SubscriptionsClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [servers, setServers] = useState<EmbyServer[]>([]);

  const [edit, setEdit] = useState<EditState>({ open: false });
  const editRef = useRef<EditState>(edit);

  function setEditSafe(updater: (prev: EditState) => EditState) {
    setEdit((prev) => {
      const next = updater(prev);
      editRef.current = next;
      return next;
    });
  }
  const [templateUsers, setTemplateUsers] = useState<Record<string, Array<{ id: string; name: string }>>>({});

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch("/api/admin/plans", { cache: "no-store" }),
        fetch("/api/admin/emby-servers", { cache: "no-store" }),
      ]);
      const pJson = await pRes.json().catch(() => null);
      const sJson = await sRes.json().catch(() => null);
      if (!pRes.ok) throw new Error(pJson?.error ? JSON.stringify(pJson) : `HTTP ${pRes.status}`);
      if (!sRes.ok) throw new Error(sJson?.error ? JSON.stringify(sJson) : `HTTP ${sRes.status}`);

      setPlans(pJson.plans ?? []);
      setServers(sJson.servers ?? []);
    } catch (e: any) {
      setError(e?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  async function loadTemplateUsers(embyServerId: string) {
    if (!embyServerId) return;
    if (templateUsers[embyServerId]) return;

    const res = await fetch(`/api/admin/emby-servers/${embyServerId}/users`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}`);
    const users = (json.users ?? []).map((u: any) => ({ id: u.id, name: u.name }));
    setTemplateUsers((m) => ({ ...m, [embyServerId]: users }));
  }

  function openCreate() {
    const next: EditState = {
      open: true,
      id: null,
      loading: false,
      error: null,
      name: "",
      description: "",
      enabled: true,
      visible: true,
      serverAssignStrategy: "LOAD_BALANCE",
      trialPrice: "",
      trialDays: "",
      monthlyPrice: "",
      quarterlyPrice: "",
      halfYearlyPrice: "",
      yearlyPrice: "",
      twoYearlyPrice: "",
      servers: [],
    };
    editRef.current = next;
    setEdit(next);
  }

  function openEdit(p: PlanRow) {
    const pricing = p.pricingJson ?? {};
    const next: EditState = {
      open: true,
      id: p.id,
      loading: false,
      error: null,
      name: p.name,
      description: p.description ?? "",
      enabled: p.enabled,
      visible: p.visible,
      serverAssignStrategy: p.serverAssignStrategy,
      trialPrice: centsToYuanInt(pricing?.trial?.priceCents),
      trialDays: pricing?.trial?.days ? String(pricing.trial.days) : "",
      monthlyPrice: centsToYuanInt(pricing?.monthly?.priceCents),
      quarterlyPrice: centsToYuanInt(pricing?.quarterly?.priceCents),
      halfYearlyPrice: centsToYuanInt(pricing?.halfYearly?.priceCents),
      yearlyPrice: centsToYuanInt(pricing?.yearly?.priceCents),
      twoYearlyPrice: centsToYuanInt(pricing?.twoYearly?.priceCents),
      servers: (p.serverConfigs ?? []).map((c) => ({ embyServerId: c.embyServerId, templateEmbyUserId: c.templateEmbyUserId })),
    };
    editRef.current = next;
    setEdit(next);

    // preload template users for current servers
    (p.serverConfigs ?? []).forEach((c) => {
      loadTemplateUsers(c.embyServerId).catch(() => null);
    });
  }

  const canSave = useMemo(() => {
    if (!edit.open) return false;
    if (!edit.name.trim()) return false;
    if (!edit.servers.length) return false;
    if (edit.servers.some((s) => !s.embyServerId || !s.templateEmbyUserId)) return false;

    const hasAnyPrice = [edit.monthlyPrice, edit.quarterlyPrice, edit.halfYearlyPrice, edit.yearlyPrice, edit.twoYearlyPrice].some((v) => v.trim().length > 0);

    // 试用必须同时填：价格 + 天数 才启用
    const trialPriceFilled = edit.trialPrice.trim().length > 0;
    const trialDaysFilled = edit.trialDays.trim().length > 0;
    const trialEnabled = trialPriceFilled || trialDaysFilled;
    if (trialEnabled && !(trialPriceFilled && trialDaysFilled)) return false;

    // 至少设置一个计费周期价格（试用不算）
    if (!hasAnyPrice) return false;

    for (const f of [edit.monthlyPrice, edit.quarterlyPrice, edit.halfYearlyPrice, edit.yearlyPrice, edit.twoYearlyPrice, edit.trialPrice]) {
      const c = yuanIntToCents(f);
      if (c === null) continue;
      if (Number.isNaN(c)) return false;
    }

    if (trialDaysFilled) {
      if (!/^[0-9]+$/.test(edit.trialDays.trim())) return false;
      const d = Number(edit.trialDays.trim());
      if (!Number.isFinite(d) || d <= 0) return false;
    }

    return true;
  }, [edit]);

  async function save() {
    const cur = editRef.current;
    if (!cur.open) return;

    setEditSafe((prev) => {
      if (!prev.open) return prev;
      return { ...prev, loading: true, error: null };
    });

    try {
      const pricing: any = {};

      const trialC = yuanIntToCents(cur.trialPrice);
      const trialD = cur.trialDays.trim() ? Number(cur.trialDays.trim()) : null;
      const trialEnabled = cur.trialPrice.trim() || cur.trialDays.trim();
      if (trialEnabled) {
        if (trialC === null || Number.isNaN(trialC)) throw new Error("trial_price_invalid");
        if (trialD === null || !Number.isFinite(trialD) || trialD <= 0) throw new Error("trial_days_invalid");
        pricing.trial = { priceCents: trialC, days: trialD };
      }

      const setPrice = (key: string, v: string) => {
        const c = yuanIntToCents(v);
        if (c === null) return;
        if (Number.isNaN(c)) throw new Error(`${key}_price_invalid`);
        pricing[key] = { priceCents: c };
      };
      setPrice("monthly", cur.monthlyPrice);
      setPrice("quarterly", cur.quarterlyPrice);
      setPrice("halfYearly", cur.halfYearlyPrice);
      setPrice("yearly", cur.yearlyPrice);
      setPrice("twoYearly", cur.twoYearlyPrice);

      const payload = {
        name: cur.name.trim(),
        description: cur.description,
        enabled: cur.enabled,
        visible: cur.visible,
        serverAssignStrategy: cur.serverAssignStrategy,
        pricing,
        servers: cur.servers,
      };

      const url = cur.id ? `/api/admin/plans/${cur.id}` : "/api/admin/plans";
      const method = cur.id ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const text = await res.text();
      const json = (() => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })();
      if (!res.ok) {
        throw new Error(json?.error ? JSON.stringify(json) : `HTTP ${res.status}: ${text?.slice?.(0, 5000) ?? text}`);
      }

      editRef.current = { open: false };
      setEdit({ open: false });
      // Update local list first (avoid "saved but looks unchanged" if refresh fails)
      if (json?.plan?.id) {
        setPlans((prev) => prev.map((x) => (x.id === json.plan.id ? { ...x, ...json.plan } : x)));
      } else {
        await refreshAll();
      }
      // Also refresh in background to re-sync counts/configs
      refreshAll().catch(() => null);
    } catch (e: any) {
      const msg = e?.message ?? "save_failed";
      // Make it impossible to miss in production.
      try {
        alert(`保存失败：${msg}`);
      } catch {}
      setEditSafe((s) => {
        if (!s.open) return s;
        return { ...s, loading: false, error: msg };
      });
    }
  }

  async function removePlan(id: string) {
    const plan = plans.find((p) => p.id === id);
    const cnt = plan?.subscriptionCount ?? null;
    const hint = cnt && cnt > 0 ? `\n\n注意：该计划当前有 ${cnt} 个订阅，不能删除。` : "";
    if (!confirm("确定删除该订阅计划？" + hint)) return;

    const res = await fetch(`/api/admin/plans/${id}`, { method: "DELETE" });
    const text = await res.text();
    const json = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })();

    if (!res.ok) {
      if (json?.error === "plan_in_use") {
        alert(`删除失败：该计划已被订阅（${json.subscriptionCount ?? "?"}）`);
      } else {
        alert(json?.error ? JSON.stringify(json) : `HTTP ${res.status}: ${text?.slice?.(0, 5000) ?? text}`);
      }
      return;
    }

    await refreshAll();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">共 {plans.length} 个订阅计划</div>
        <button className="bg-black text-white rounded px-3 py-2" onClick={openCreate}>
          + 创建订阅
        </button>
      </div>

      {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}
      {loading ? <div className="text-sm text-gray-500">加载中…</div> : null}

      <div className="border rounded-lg overflow-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="text-left text-gray-600 border-b">
            <tr>
              <th className="py-2 px-3">名称</th>
              <th className="py-2 px-3">可用</th>
              <th className="py-2 px-3">显示</th>
              <th className="py-2 px-3">服务器数</th>
              <th className="py-2 px-3">订阅数</th>
              <th className="py-2 px-3">策略</th>
              <th className="py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-2 px-3 font-medium">{p.name}</td>
                <td className="py-2 px-3">{p.enabled ? "可用" : "禁用"}</td>
                <td className="py-2 px-3">{p.visible ? "显示" : "隐藏"}</td>
                <td className="py-2 px-3">{p.serverConfigs?.length ?? 0}</td>
                <td className="py-2 px-3">{p.subscriptionCount ?? "-"}</td>
                <td className="py-2 px-3">{p.serverAssignStrategy === "ALL" ? "全部分配" : "负载均衡"}</td>
                <td className="py-2 px-3">
                  <div className="flex gap-2">
                    <button className="border rounded px-2 py-1" onClick={() => openEdit(p)}>
                      编辑
                    </button>
                    <button className="border rounded px-2 py-1 text-red-600" onClick={() => removePlan(p.id)}>
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!plans.length && !loading ? (
              <tr>
                <td className="py-6 px-3 text-gray-500" colSpan={7}>
                  暂无订阅计划
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {edit.open ? (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-lg shadow p-4 space-y-4 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{edit.id ? "编辑订阅计划" : "创建订阅计划"}</div>
              <button className="text-sm" onClick={() => setEdit({ open: false })}>
                关闭
              </button>
            </div>

            {edit.error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{edit.error}</pre> : null}

            <section className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">订阅名称</label>
                  <input className="mt-1 w-full border rounded px-3 py-2" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm">服务器分配策略</label>
                  <select
                    className="mt-1 w-full border rounded px-3 py-2"
                    value={edit.serverAssignStrategy}
                    onChange={(e) =>
                      setEditSafe((prev) => {
                        if (!prev.open) return prev;
                        return { ...prev, serverAssignStrategy: e.target.value as any };
                      })
                    }
                  >
                    <option value="LOAD_BALANCE">负载均衡（默认）</option>
                    <option value="ALL">全部分配（每个服务器都创建账号）</option>
                  </select>
                  <div className="text-xs text-gray-500 mt-1">（后期可按你要求做：设置后不可修改）</div>
                </div>
              </div>

              <div>
                <label className="text-sm">订阅描述</label>
                <textarea
                  className="mt-1 w-full border rounded px-3 py-2 min-h-[160px]"
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  placeholder="支持 Markdown/HTML（前台以富文本渲染）"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} />
                  可用状态（允许新订单）
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={edit.visible} onChange={(e) => setEdit({ ...edit, visible: e.target.checked })} />
                  显示状态（前端展示）
                </label>
              </div>
            </section>

            <section className="space-y-3">
              <div className="font-medium">订阅价格设置（元，整数）</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">试用价格（可选）</label>
                  <input className="mt-1 w-full border rounded px-3 py-2" value={edit.trialPrice} onChange={(e) => setEdit({ ...edit, trialPrice: e.target.value })} placeholder="例如 0 或 10" inputMode="numeric" />
                </div>
                <div>
                  <label className="text-sm">试用天数（可选）</label>
                  <input className="mt-1 w-full border rounded px-3 py-2" value={edit.trialDays} onChange={(e) => setEdit({ ...edit, trialDays: e.target.value })} placeholder="例如 3" />
                </div>
                <div>
                  <label className="text-sm">月付价格</label>
                  <input className="mt-1 w-full border rounded px-3 py-2" value={edit.monthlyPrice} onChange={(e) => setEdit({ ...edit, monthlyPrice: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm">季付价格</label>
                  <input className="mt-1 w-full border rounded px-3 py-2" value={edit.quarterlyPrice} onChange={(e) => setEdit({ ...edit, quarterlyPrice: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm">半年付价格</label>
                  <input className="mt-1 w-full border rounded px-3 py-2" value={edit.halfYearlyPrice} onChange={(e) => setEdit({ ...edit, halfYearlyPrice: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm">年付价格</label>
                  <input className="mt-1 w-full border rounded px-3 py-2" value={edit.yearlyPrice} onChange={(e) => setEdit({ ...edit, yearlyPrice: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm">两年付价格</label>
                  <input className="mt-1 w-full border rounded px-3 py-2" value={edit.twoYearlyPrice} onChange={(e) => setEdit({ ...edit, twoYearlyPrice: e.target.value })} />
                </div>
              </div>
              <div className="text-xs text-gray-500">价格为空的周期，前端不展示。至少需要设置一个周期价格。</div>
            </section>

            <section className="space-y-3">
              <div className="font-medium">Emby 服务器配置（每台服务器选择一个模板用户）</div>
              <div className="space-y-3">
                {edit.servers.map((row, idx) => (
                  <div key={idx} className="border rounded p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Emby 服务器 #{idx + 1}</div>
                      <button
                        className="text-sm text-red-600"
                        onClick={() => {
                          const next = edit.servers.slice();
                          next.splice(idx, 1);
                          setEdit({ ...edit, servers: next });
                        }}
                      >
                        删除
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm">服务器</label>
                        <select
                          className="mt-1 w-full border rounded px-3 py-2"
                          value={row.embyServerId}
                          onChange={(e) => {
                            const v = e.target.value;
                            const next = edit.servers.slice();
                            next[idx] = { embyServerId: v, templateEmbyUserId: "" };
                            setEdit({ ...edit, servers: next });
                            loadTemplateUsers(v).catch((err) => setEdit({ ...edit, error: String(err?.message ?? err) }));
                          }}
                        >
                          <option value="">选择服务器…</option>
                          {servers
                            .filter((s) => s.enabled)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-sm">模板用户</label>
                        <select
                          className="mt-1 w-full border rounded px-3 py-2"
                          value={row.templateEmbyUserId}
                          onChange={(e) => {
                            const v = e.target.value;
                            const next = edit.servers.slice();
                            next[idx] = { ...next[idx], templateEmbyUserId: v };
                            setEdit({ ...edit, servers: next });
                          }}
                          disabled={!row.embyServerId}
                        >
                          <option value="">选择模板用户…</option>
                          {(templateUsers[row.embyServerId] ?? []).map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                        <div className="text-xs text-gray-500 mt-1">新用户会继承模板用户的权限/Policy</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="border rounded px-3 py-2"
                onClick={() => setEdit({ ...edit, servers: [...edit.servers, { embyServerId: "", templateEmbyUserId: "" }] })}
              >
                + 添加 Emby 服务器
              </button>
            </section>

            <div className="flex gap-3 justify-end pt-2">
              <button className="border rounded px-3 py-2" onClick={() => setEdit({ open: false })}>
                取消
              </button>
              <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={!canSave || edit.loading} onClick={save}>
                {edit.loading ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
