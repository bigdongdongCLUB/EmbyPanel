"use client";

import { useEffect, useRef, useState } from "react";
import { ToggleSwitch } from "./settings/toggle-switch";

type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG";

interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
  source?: string;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  ERROR: "text-red-400",
  WARN: "text-yellow-400",
  INFO: "text-green-400",
  DEBUG: "text-blue-400",
};

const LEVEL_BG: Record<LogLevel, string> = {
  ERROR: "bg-red-900/20",
  WARN: "bg-yellow-900/20",
  INFO: "bg-green-900/20",
  DEBUG: "bg-blue-900/20",
};

const PANEL_FIELD_CLASS =
  "h-10 rounded-xl border border-[#eaeaea] bg-white px-3 text-sm text-[#222] outline-none transition focus:border-[#e3001b]";

const PANEL_BUTTON_CLASS =
  "inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#eaeaea] bg-white px-3 text-sm text-[#222] transition hover:bg-[#f4f5f7] hover:border-[#d9d9d9]";

function createMockLogs(): LogEntry[] {
  const mockLogs: LogEntry[] = [];
  const now = Date.now();
  const levels: LogLevel[] = ["ERROR", "WARN", "INFO", "DEBUG"];
  const messages = [
    "[EmbyAPI] 连接测试成功",
    "[EmbyAPI] 连接测试失败",
    "[auth] 用户登录成功",
    "[auth] Session 创建成功",
    "[vod] 点播请求已提交",
    "[vod] 点播记录已删除",
    "[payment] 订单支付成功",
    "[payment] 订单已取消",
  ];

  for (let i = 0; i < 100; i++) {
    const level = levels[Math.floor(Math.random() * levels.length)];
    const message = messages[Math.floor(Math.random() * messages.length)];
    mockLogs.push({
      id: i,
      timestamp: new Date(now - (100 - i) * 60000).toISOString(),
      level,
      message,
      source: Math.random() > 0.5 ? "[EmbyApi]" : "[auth]",
    });
  }

  return mockLogs;
}

export function AdminLogModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<LogEntry[]>(() => createMockLogs());
  const [levelFilter, setLevelFilter] = useState<LogLevel | "ALL">("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      const levels: LogLevel[] = ["ERROR", "WARN", "INFO", "DEBUG"];
      const messages = [
        "[EmbyAPI] 连接测试成功",
        "[EmbyAPI] 连接测试失败",
        "[auth] 用户登录成功",
        "[vod] 点播请求已提交",
      ];
      const level = levels[Math.floor(Math.random() * levels.length)];
      const message = messages[Math.floor(Math.random() * messages.length)];

      setLogs((prev) => [
        ...prev,
        {
          id: prev.length,
          timestamp: new Date().toISOString(),
          level,
          message,
          source: "[system]",
        },
      ]);
    }, 3000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const filteredLogs = levelFilter === "ALL" ? logs : logs.filter((log) => log.level === levelFilter);

  const downloadLogs = () => {
    const content = filteredLogs
      .map((log) => `${log.timestamp} [${log.level}] ${log.source || ""} ${log.message}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const refreshLogs = () => {
    setLogs((prev) => [...prev]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-[#eaeaea] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.14)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#eaeaea] px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-[#222]">系统日志</h2>
            <p className="mt-1 text-sm text-[#888]">查看实时日志、筛选级别并导出当前结果。</p>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#eaeaea] bg-[#f8f9fa] text-[#666] transition hover:border-[#d9d9d9] hover:bg-white hover:text-[#222]"
            onClick={onClose}
            title="关闭"
            aria-label="关闭"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-[#eaeaea] bg-[#f8f9fa] px-6 py-4">
          <div className="flex items-center gap-2 rounded-2xl border border-[#eaeaea] bg-white px-3 py-2">
            <label className="text-sm text-[#666]" htmlFor="log-level-filter">
              日志级别:
            </label>
            <select
              id="log-level-filter"
              className={`${PANEL_FIELD_CLASS} min-w-[96px] bg-[#f4f5f7]`}
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as LogLevel | "ALL")}
            >
              <option value="ALL">全部</option>
              <option value="ERROR">Error</option>
              <option value="WARN">Warn</option>
              <option value="INFO">Info</option>
              <option value="DEBUG">Debug</option>
            </select>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-[#eaeaea] bg-white px-3 py-2">
            <label className="text-sm text-[#666]">自动刷新:</label>
            <ToggleSwitch checked={autoRefresh} onChange={setAutoRefresh} textOn="自动刷新已开启" textOff="自动刷新已关闭" />
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-[#eaeaea] bg-white px-3 py-2">
            <label className="text-sm text-[#666]">自动滚动:</label>
            <ToggleSwitch checked={autoScroll} onChange={setAutoScroll} textOn="自动滚动已开启" textOff="自动滚动已关闭" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button type="button" className={PANEL_BUTTON_CLASS} onClick={refreshLogs} title="刷新">
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-[#666]" aria-hidden="true">
                <path d="M16.667 10A6.667 6.667 0 1 1 14.714 5.286" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15 2.5v3.333h-3.333" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>刷新</span>
            </button>

            <button type="button" className={PANEL_BUTTON_CLASS} onClick={downloadLogs} title="下载">
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-[#666]" aria-hidden="true">
                <path d="M10 3.333v8.334" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M6.667 8.333L10 11.667l3.333-3.334" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4.167 15.833h11.666" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <span>下载</span>
            </button>
          </div>
        </div>

        <div className="bg-white px-6 py-5">
          <div ref={containerRef} className="h-[58vh] overflow-auto rounded-2xl border border-[#1f2937] bg-[#111827] p-4 font-mono text-xs shadow-inner">
            {filteredLogs.length === 0 ? (
              <div className="py-10 text-center text-gray-500">暂无日志</div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className={`rounded-lg px-2.5 py-1.5 transition hover:bg-gray-800/50 ${LEVEL_BG[log.level]}`}>
                  <span className="text-gray-500">[{new Date(log.timestamp).toLocaleString("zh-CN", { hour12: false })}]</span>{" "}
                  <span className={`font-semibold ${LEVEL_COLORS[log.level]}`}>[{log.level}]</span>{" "}
                  {log.source ? <span className="text-gray-400">{log.source}</span> : null}{" "}
                  <span className="text-gray-200">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#eaeaea] bg-[#f8f9fa] px-6 py-3 text-xs text-[#888]">
          <div>
            总行数：{logs.length} | 显示行数：{filteredLogs.length}
          </div>
          <div>
            文件大小：{(JSON.stringify(filteredLogs).length / 1024).toFixed(2)} KB | 最后更新：{new Date().toLocaleString("zh-CN", { hour12: false })}
          </div>
        </div>
      </div>
    </div>
  );
}
