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
      className={`relative inline-flex h-[25px] w-[60px] items-center rounded-full border transition-all ${
        checked ? "bg-[#e3001b] border-[#e3001b]" : "bg-[#bfbfbf] border-[#bfbfbf]"
      }`}
      title={checked ? textOn : textOff}
    >
      <span className={`absolute top-1/2 -translate-y-1/2 h-[19px] w-[19px] rounded-full bg-white shadow transition-all ${checked ? "right-1" : "left-1"}`} />
    </button>
  );
}
