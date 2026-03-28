"use client";

import { useState } from "react";

type Props = {
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  pageSizeOptions?: number[];
  showPageSize?: boolean;
  compactSinglePage?: boolean;
  simpleGoto?: boolean;
};

export function PaginationBar({
  total,
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  showPageSize = true,
  simpleGoto = true,
}: Props) {
  const [goto, setGoto] = useState("");

  function jumpToPage() {
    const p = Number(goto);
    if (Number.isFinite(p) && p >= 1 && p <= totalPages) onPageChange(p);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm">
      <div className="text-gray-600">共 {total} 条</div>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 whitespace-nowrap">
          <button className="h-7 w-7 rounded text-gray-600 disabled:opacity-40" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            {"<"}
          </button>
          <span className="h-7 min-w-7 px-1.5 inline-flex items-center justify-center text-gray-800 select-none">
            {page}/{totalPages}
          </span>
          <button className="h-7 w-7 rounded text-gray-600 disabled:opacity-40" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            {">"}
          </button>
        </div>

        {showPageSize ? (
          <select
            className="h-8 border rounded px-2 text-sm"
            value={String(pageSize)}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
          >
            {pageSizeOptions.map((v) => (
              <option key={v} value={v}>{`${v} / page`}</option>
            ))}
          </select>
        ) : null}

        {simpleGoto ? (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <input
              className="h-8 w-16 border rounded px-2"
              value={goto}
              onChange={(e) => setGoto(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") jumpToPage();
              }}
            />
            <button className="h-8 border border-[#eaeaea] bg-white rounded-lg px-2 hover:bg-[#f4f5f7]" onClick={jumpToPage}>Go</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span>Go to</span>
            <input
              className="h-8 w-14 border rounded px-2"
              value={goto}
              onChange={(e) => setGoto(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") jumpToPage();
              }}
            />
            <span>Page</span>
          </div>
        )}
      </div>
    </div>
  );
}
