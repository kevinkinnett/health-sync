import { useDateRangeStore, type PresetRange } from "../../stores/dateRangeStore";

const presets: { label: string; value: PresetRange }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

export function DateRangePresets({
  className = "",
  label = "Date range",
}: {
  className?: string;
  label?: string;
}) {
  const { preset, setPreset } = useDateRangeStore();

  return (
    <div
      aria-label={label}
      className={`grid grid-cols-4 items-center gap-1 rounded-xl border border-outline-variant/10 bg-surface-container-low p-1 ${className}`}
    >
      {presets.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setPreset(option.value)}
          aria-pressed={preset === option.value}
          className={`min-h-9 rounded-lg px-3 text-xs font-bold uppercase tracking-wider transition-all ${
            preset === option.value
              ? "bg-primary text-on-primary-fixed"
              : "text-outline hover:bg-surface-container-high hover:text-on-surface"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
