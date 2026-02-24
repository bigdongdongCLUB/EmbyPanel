"use client";

import { useEffect, useRef, useState } from "react";

type PendingConfirm = {
  id: number;
  message: string;
  resolve: (v: boolean) => void;
};

export function AppConfirmHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const idRef = useRef(1);

  useEffect(() => {
    const originalConfirm = window.confirm;
    (window as any).__originalConfirm = originalConfirm;

    (window as any).showConfirm = (message: string): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        const id = idRef.current++;
        setPending({ id, message, resolve });
      });
    };

    window.confirm = (message?: string): boolean => {
      (window as any).showConfirm(String(message ?? "确认此操作？"));
      return false;
    };

    return () => {
      if ((window as any).__originalConfirm) window.confirm = (window as any).__originalConfirm;
      delete (window as any).showConfirm;
    };
  }, []);

  if (!pending) return null;

  function close(result: boolean) {
    if (!pending) return;
    pending.resolve(result);
    setPending(null);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={() => close(false)} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-[340px] max-w-[90vw] p-6">
        <div className="text-base font-semibold text-gray-800 mb-4 whitespace-pre-wrap leading-relaxed">
          {pending.message}
        </div>
        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 rounded-lg border bg-white text-gray-700 text-sm hover:bg-gray-50"
            onClick={() => close(false)}
          >
            取消
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-800"
            onClick={() => close(true)}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
