"use client";

import { useEffect, useRef, useState } from "react";

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

export function AdminLogModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<LogLevel | "ALL">("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // 模拟日志数据（实际项目中应该连接后端日志接口）
  useEffect(() => {
    // 生成一些示例日志
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

    setLogs(mockLogs);
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // 自动刷新（模拟 WebSocket 连接）
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

  // ESC 关闭
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
    // 实际项目中这里应该调用后端 API 刷新日志
    setLogs((prev) => [...prev]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">系统日志</h2>
          <button
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-lg"
            onClick={onClose}
            title="关闭"
          >
            ×
          </button>
        </div>

        {/* 工具栏 */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">日志级别:</label>
            <select
              className="border border-gray-300 rounded px-2 py-1 text-sm"
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

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">自动刷新:</label>
            <button
              className={`w-10 h-5 rounded-full transition-colors ${autoRefresh ? "bg-green-500" : "bg-gray-300"}`}
              onClick={() => setAutoRefresh((v) => !v)}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${autoRefresh ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">自动滚动:</label>
            <button
              className={`w-10 h-5 rounded-full transition-colors ${autoScroll ? "bg-blue-500" : "bg-gray-300"}`}
              onClick={() => setAutoScroll((v) => !v)}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${autoScroll ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          <div className="flex-1" />

          <button
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-100 text-sm"
            onClick={refreshLogs}
            title="刷新"
          >
            <img src="/icons/refresh.svg" alt="刷新" className="h-3.5 w-3.5" />
            <span>刷新</span>
          </button>

          <button
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-100 text-sm"
            onClick={downloadLogs}
            title="下载"
          >
            <img src="/icons/download.svg" alt="下载" className="h-3.5 w-3.5" />
            <span>下载</span>
          </button>
        </div>

        {/* 日志内容 */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-gray-900 p-4 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="text-gray-500 text-center py-10">暂无日志</div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`py-1 px-2 rounded ${LEVEL_BG[log.level]} hover:bg-gray-800/50`}
              >
                <span className="text-gray-500">[{new Date(log.timestamp).toLocaleString("zh-CN", { hour12: false })}]</span>{" "}
                <span className={`font-semibold ${LEVEL_COLORS[log.level]}`}>[{log.level}]</span>{" "}
                {log.source && <span className="text-gray-400">{log.source}</span>}{" "}
                <span className="text-gray-200">{log.message}</span>
              </div>
            ))
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-6 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
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
