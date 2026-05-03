"use client";

import { useMemo, useState } from "react";
import type { UserTrendSeries } from "./dashboard-stats";

type TooltipState = {
  x: number;
  y: number;
  date: string;
  seriesName: string;
  label: string;
  value: number;
  color: string;
};

function niceChartMax(value: number) {
  if (value <= 10) return 10;
  const padded = value * 1.12;
  const magnitude = Math.pow(10, Math.floor(Math.log10(padded)));
  const normalized = padded / magnitude;
  const nice = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function UserTrendChart({ series }: { series: UserTrendSeries[] }) {
  const [selectedId, setSelectedId] = useState("all");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const selectedSeries = useMemo(() => {
    return series.find((item) => item.id === selectedId) ?? series[0] ?? { id: "all", name: "全部服务器", data: [] };
  }, [selectedId, series]);
  const chartData = selectedSeries.data.slice(-30);
  const maxValue = niceChartMax(Math.max(...chartData.flatMap((d) => [d.activeUsers, d.totalUsers]), 0));
  const width = 960;
  const height = 360;
  const plot = { x: 70, y: 34, width: 840, height: 230 };
  const baseline = plot.y + plot.height;
  const groupWidth = plot.width / Math.max(chartData.length, 1);
  const barWidth = Math.max(4, Math.min(11, groupWidth * 0.26));
  const ticks = Array.from({ length: 5 }, (_, index) => Math.round((maxValue / 4) * index));
  const labelIndexes = new Set([0, 4, 9, 14, 19, 24, 29].filter((index) => index < chartData.length));
  const latest = chartData[chartData.length - 1];
  const isAllServers = selectedSeries.id === "all";
  const tooltipWidth = 184;
  const tooltipHeight = 70;
  const tooltipX = tooltip ? Math.max(8, Math.min(width - tooltipWidth - 8, tooltip.x - tooltipWidth / 2)) : 0;
  const tooltipY = tooltip ? Math.max(8, tooltip.y - tooltipHeight - 12) : 0;

  return (
    <div className="bg-white border border-[#eaeaea] rounded-2xl p-5 sm:p-8 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-5">
        <div>
          <div className="text-base font-bold text-[#222]">30天用户数概览</div>
          <div className="text-sm text-[#888] mt-1">
            {isAllServers ? "红色为截至当天的面板用户总数，灰色为当天有播放记录的活跃用户数。" : "红色为截至当天分配至该服务器的面板用户数，灰色为该服务器当天活跃用户数。"}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="h-9 min-w-[180px] rounded-lg border border-[#eaeaea] bg-[#f8f9fa] px-3 text-sm text-[#333] outline-none focus:border-[#e3001b]"
            value={selectedSeries.id}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="选择服务器"
          >
            {series.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {latest ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[#fff4f1] text-[#c93a24] border border-[#ffd6cc] px-3 py-1">当前总用户 {latest.totalUsers}</span>
              <span className="rounded-full bg-[#f3f4f6] text-[#555] border border-[#e5e7eb] px-3 py-1">今日活跃 {latest.activeUsers}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="w-full overflow-hidden">
        <svg className="block w-full h-auto" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${selectedSeries.name} 30天用户数概览柱状图`}>
          <defs>
            <linearGradient id="activeUserBar" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#6f7175" />
              <stop offset="100%" stopColor="#4d4f53" />
            </linearGradient>
            <linearGradient id="totalUserBar" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#d54830" />
              <stop offset="100%" stopColor="#b92f1f" />
            </linearGradient>
          </defs>

          {ticks.map((tick) => {
            const y = baseline - (tick / maxValue) * plot.height;
            return (
              <g key={tick}>
                <line x1={plot.x} y1={y} x2={plot.x + plot.width} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                <text x={plot.x - 16} y={y + 5} textAnchor="end" className="fill-[#666] text-[15px] font-medium">
                  {tick}
                </text>
              </g>
            );
          })}

          <line x1={plot.x} y1={baseline} x2={plot.x + plot.width} y2={baseline} stroke="#222" strokeWidth="2" />

          {chartData.map((point, index) => {
            const center = plot.x + index * groupWidth + groupWidth / 2;
            const activeHeight = (point.activeUsers / maxValue) * plot.height;
            const totalHeight = (point.totalUsers / maxValue) * plot.height;
            const activeX = center - barWidth - 1.5;
            const totalX = center + 1.5;
            const activeY = baseline - activeHeight;
            const totalY = baseline - totalHeight;
            return (
              <g key={point.date}>
                <rect
                  x={activeX}
                  y={activeY}
                  width={barWidth}
                  height={activeHeight}
                  rx="2"
                  fill="url(#activeUserBar)"
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  tabIndex={0}
                  onFocus={() => setTooltip({ x: activeX + barWidth / 2, y: activeY, date: point.date, seriesName: selectedSeries.name, label: "日活跃", value: point.activeUsers, color: "#4d4f53" })}
                  onBlur={() => setTooltip(null)}
                  onMouseEnter={() => setTooltip({ x: activeX + barWidth / 2, y: activeY, date: point.date, seriesName: selectedSeries.name, label: "日活跃", value: point.activeUsers, color: "#4d4f53" })}
                  onMouseLeave={() => setTooltip(null)}
                />
                <rect
                  x={totalX}
                  y={totalY}
                  width={barWidth}
                  height={totalHeight}
                  rx="2"
                  fill="url(#totalUserBar)"
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  tabIndex={0}
                  onFocus={() => setTooltip({ x: totalX + barWidth / 2, y: totalY, date: point.date, seriesName: selectedSeries.name, label: "总用户", value: point.totalUsers, color: "#b92f1f" })}
                  onBlur={() => setTooltip(null)}
                  onMouseEnter={() => setTooltip({ x: totalX + barWidth / 2, y: totalY, date: point.date, seriesName: selectedSeries.name, label: "总用户", value: point.totalUsers, color: "#b92f1f" })}
                  onMouseLeave={() => setTooltip(null)}
                />
                {labelIndexes.has(index) ? (
                  <text x={center} y={baseline + 28} textAnchor="middle" className="fill-[#333] text-[15px] font-semibold">
                    {point.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          <g transform={`translate(${width / 2 - 130} ${height - 42})`} className="text-[15px]">
            <rect x="0" y="-12" width="14" height="14" rx="2" fill="url(#activeUserBar)" />
            <text x="26" y="0" className="fill-[#222] font-medium">日活跃</text>
            <rect x="150" y="-12" width="14" height="14" rx="2" fill="url(#totalUserBar)" />
            <text x="176" y="0" className="fill-[#222] font-medium">总用户</text>
          </g>

          {tooltip ? (
            <g pointerEvents="none" transform={`translate(${tooltipX} ${tooltipY})`}>
              <rect width={tooltipWidth} height={tooltipHeight} rx="10" fill="#111827" opacity="0.94" />
              <rect x="14" y="17" width="10" height="10" rx="2" fill={tooltip.color} />
              <text x="32" y="25" className="fill-white text-[13px] font-semibold">
                {tooltip.label}：{tooltip.value}
              </text>
              <text x="14" y="46" className="fill-[#d1d5db] text-[12px]">
                {tooltip.date}
              </text>
              <text x="14" y="62" className="fill-[#d1d5db] text-[12px]">
                {tooltip.seriesName}
              </text>
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}
