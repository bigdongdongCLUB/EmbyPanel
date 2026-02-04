"use client";

import { useEffect, useMemo, useState } from "react";

type Server = {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  lastHealthAt: string | null;
  lastHealthOk: boolean | null;
  lastHealthMsg: string | null;
};

export function ServersClient() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const canSubmit = useMemo(() => !!name && !!baseUrl && apiKey.length >= 10, [name, baseUrl, apiKey]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/emby-servers", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setServers(json.servers);
    } catch (e: any) {
      setError(e?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-8">
      <section className="border rounded-lg p-4">
        <h2 className="font-semibold">新增服务器</h2>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm">名称</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="比如：4U Emby" />
          </div>
          <div>
            <label className="text-sm">Base URL</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://host:8096" />
          </div>
          <div>
            <label className="text-sm">API Key</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Emby API Key" />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
            disabled={!canSubmit}
            onClick={async () => {
              setError(null);
              const res = await fetch("/api/admin/emby-servers", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, baseUrl, apiKey }),
              });
              if (!res.ok) {
                const t = await res.text();
                setError(t);
                return;
              }
              setName("");
              setBaseUrl("");
              setApiKey("");
              await refresh();
            }}
          >
            保存
          </button>
          <button className="border rounded px-3 py-2" onClick={refresh}>
            刷新
          </button>
        </div>
        {error ? <pre className="mt-3 text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : null}
      </section>

      <section className="border rounded-lg p-4">
        <h2 className="font-semibold">服务器列表</h2>

        {loading ? <div className="mt-3 text-sm text-gray-500">加载中…</div> : null}

        {!loading && servers.length === 0 ? <div className="mt-3 text-sm text-gray-500">暂无服务器</div> : null}

        <div className="mt-4 space-y-3">
          {servers.map((s) => (
            <div key={s.id} className="border rounded p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-sm text-gray-600">{s.baseUrl}</div>
                <div className="text-xs text-gray-500 mt-1">
                  health: {s.lastHealthOk === null ? "-" : s.lastHealthOk ? "OK" : "FAIL"} {s.lastHealthMsg ? `· ${s.lastHealthMsg}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="border rounded px-3 py-2"
                  onClick={async () => {
                    const res = await fetch(`/api/admin/emby-servers/${s.id}/test`, { method: "POST" });
                    const txt = await res.text();
                    if (!res.ok) {
                      alert(`测试失败: ${txt}`);
                    } else {
                      alert(`测试成功: ${txt}`);
                    }
                    await refresh();
                  }}
                >
                  测试连接
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
