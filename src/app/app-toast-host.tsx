"use client";

import { useEffect, useRef, useState } from "react";

type Toast = { id: number; text: string; tone: "success" | "error" | "info" };

function pickTone(text: string): Toast["tone"] {
  const t = text.toLowerCase();

  // 导入/汇总类文案中“失败0”应判定为成功态
  const hasFailedZero = /失败\s*[:：]?\s*0\b/.test(t);
  if (hasFailedZero && (t.includes("成功") || t.includes("完成"))) return "success";

  if (t.includes("失败") || t.includes("error") || t.includes("invalid") || t.includes("not_found") || t.includes("forbidden")) {
    return "error";
  }
  if (t.includes("成功") || t.includes("已") || t.includes("ok")) return "success";
  return "info";
}

export function AppToastHost() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timerRef = useRef<any>(null);
  const idRef = useRef(1);

  useEffect(() => {
    function show(text: string) {
      const id = idRef.current++;
      setToast({ id, text, tone: pickTone(text) });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setToast((x) => (x?.id === id ? null : x)), 2200);
    }

    const oldAlert = window.alert;
    (window as any).__oldAlert = oldAlert;
    window.alert = (message?: any) => {
      const text = String(message ?? "");
      show(text);
    };

    const onToast = (e: Event) => {
      const ce = e as CustomEvent<{ text?: string }>;
      show(String(ce.detail?.text ?? ""));
    };

    window.addEventListener("app:toast", onToast as EventListener);
    return () => {
      window.removeEventListener("app:toast", onToast as EventListener);
      if ((window as any).__oldAlert) window.alert = (window as any).__oldAlert;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!toast) return null;

  const toneCls =
    toast.tone === "error"
      ? "border-red-200 text-red-700"
      : toast.tone === "success"
      ? "border-green-200 text-gray-900"
      : "border-blue-200 text-gray-900";

  const icon = toast.tone === "error" ? "×" : toast.tone === "success" ? "✓" : "i";
  const iconCls = toast.tone === "error" ? "bg-red-500" : toast.tone === "success" ? "bg-green-500" : "bg-blue-500";

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100]">
      <div className={`max-w-[80vw] bg-white border rounded-2xl shadow-xl p-[10px] flex items-center justify-center gap-2 ${toneCls}`}>
        <span className={`inline-flex h-7 w-7 min-h-7 min-w-7 shrink-0 aspect-square items-center justify-center rounded-full text-white text-[18px] font-semibold leading-none ${iconCls}`}>{icon}</span>
        <span className="text-base font-medium break-words text-center">{toast.text}</span>
      </div>
    </div>
  );
}
