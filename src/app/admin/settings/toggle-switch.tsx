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
    <label className="inline-flex items-center cursor-pointer gap-3">
      <button
        type="button"
        aria-pressed={checked}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-cyan-500" : "bg-gray-300"}`}
        onClick={() => onChange(!checked)}
      >
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
      <span className="text-sm text-gray-500">{checked ? textOn : textOff}</span>
    </label>
  );
}
