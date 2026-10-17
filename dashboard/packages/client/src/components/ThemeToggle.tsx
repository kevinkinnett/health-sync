import { useThemeStore, type ThemeChoice } from "../stores/themeStore";

/**
 * Top-bar switch: flips the painted mode and pins it. The three-way choice
 * (including "follow the system") lives in Settings → Appearance.
 */
export function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  const next = mode === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-outline transition-colors hover:bg-surface-container-low hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {mode === "dark" ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}

const OPTIONS: { value: ThemeChoice; label: string; detail: string; icon: string }[] = [
  { value: "system", label: "System", detail: "Follow the device", icon: "contrast" },
  { value: "light", label: "Light", detail: "Always light", icon: "light_mode" },
  { value: "dark", label: "Dark", detail: "Always dark", icon: "dark_mode" },
];

/** Settings radiogroup for the full light / dark / system choice. */
export function ThemeChoiceGroup() {
  const choice = useThemeStore((s) => s.choice);
  const setChoice = useThemeStore((s) => s.setChoice);
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3 mt-5">
      {OPTIONS.map((option) => {
        const active = choice === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setChoice(option.value)}
            className={`min-h-20 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              active
                ? "border-primary bg-primary/10 text-on-surface"
                : "border-outline-variant/15 bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              {option.icon}
            </span>
            <span className="block text-sm font-semibold mt-1">{option.label}</span>
            <span className="block text-xs mt-1 text-outline">{option.detail}</span>
          </button>
        );
      })}
    </div>
  );
}
