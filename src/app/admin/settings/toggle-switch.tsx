"use client";

export function ToggleSwitch({
  checked,
  onChange,
  textOn = "已开启",
  textOff = "已关闭",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  textOn?: string;
  textOff?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[30px] w-[70px] items-center rounded-full border px-2 text-sm font-semibold transition-all ${
        checked ? "bg-[#3b82f6] border-[#3b82f6] text-white" : "bg-[#bfbfbf] border-[#bfbfbf] text-white"
      }`}
    >
      <span className={`absolute top-1/2 -translate-y-1/2 h-[24px] w-[24px] rounded-full bg-white shadow transition-all ${checked ? "right-1" : "left-1"}`} />
      <span className={`w-full select-none leading-none ${checked ? "pr-5 text-left" : "pl-5 text-right"}`}>{checked ? textOn : textOff}</span>
    </button>
  );
}
