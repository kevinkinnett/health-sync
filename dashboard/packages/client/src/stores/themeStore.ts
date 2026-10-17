import { create } from "zustand";

/** What the user picked. "system" follows `prefers-color-scheme`. */
export type ThemeChoice = "light" | "dark" | "system";
/** What is actually painted. */
export type ThemeMode = "light" | "dark";

/**
 * Plain string, not zustand's JSON persist envelope: the pre-paint script
 * in index.html reads this key before any bundle loads, and it has to stay
 * small enough to inline. Keep the two in lockstep.
 */
export const THEME_STORAGE_KEY = "vitalis.theme";

/** Browser-chrome colour per mode — each mode's `--color-surface`. */
export const THEME_COLOR: Record<ThemeMode, string> = {
  dark: "#0d0f12",
  light: "#eef0f3",
};

const LIGHT_QUERY = "(prefers-color-scheme: light)";

function isChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/** The stored choice, or "system" when absent, invalid or unreadable. */
export function readStoredChoice(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isChoice(value) ? value : "system";
  } catch {
    // Storage disabled (private mode, blocked site data, sandboxed frame).
    return "system";
  }
}

function writeStoredChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Not persisted, but the choice still applies for this session.
  }
}

/**
 * The OS preference. Defaults to dark when it can't be read — the app was
 * dark-only for its whole history, so that is the least surprising fallback.
 */
export function systemMode(): ThemeMode {
  try {
    return window.matchMedia?.(LIGHT_QUERY).matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function resolveMode(choice: ThemeChoice, system: ThemeMode = systemMode()): ThemeMode {
  return choice === "system" ? system : choice;
}

/** Stamp the mode on <html> — the class the CSS tokens and variants key off. */
export function applyMode(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.classList.toggle("light", mode === "light");
  root.style.colorScheme = mode;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[mode]);
}

interface ThemeState {
  choice: ThemeChoice;
  mode: ThemeMode;
  isDark: boolean;
  setChoice: (choice: ThemeChoice) => void;
  /** Flip the painted mode, pinning it as an explicit choice. */
  toggle: () => void;
  /** Re-read the OS preference; only changes anything under "system". */
  syncSystem: () => void;
}

const initialChoice = typeof window === "undefined" ? "dark" : readStoredChoice();
const initialMode = typeof window === "undefined" ? "dark" : resolveMode(initialChoice);

export const useThemeStore = create<ThemeState>((set, get) => ({
  choice: initialChoice,
  mode: initialMode,
  isDark: initialMode === "dark",
  setChoice: (choice) => {
    writeStoredChoice(choice);
    const mode = resolveMode(choice);
    applyMode(mode);
    set({ choice, mode, isDark: mode === "dark" });
  },
  toggle: () => get().setChoice(get().mode === "dark" ? "light" : "dark"),
  syncSystem: () => {
    if (get().choice !== "system") return;
    const mode = systemMode();
    applyMode(mode);
    set({ mode, isDark: mode === "dark" });
  },
}));

if (typeof window !== "undefined") {
  // The pre-paint script already stamped the class; re-applying here keeps
  // the DOM and the store agreeing even if that script didn't run.
  applyMode(initialMode);
  try {
    window
      .matchMedia?.(LIGHT_QUERY)
      .addEventListener?.("change", () => useThemeStore.getState().syncSystem());
  } catch {
    // No media-query support: "system" stays at its initial reading.
  }
}

/**
 * Recharts styling. Every value is a CSS variable that index.css defines
 * per mode, so charts follow a theme switch without re-rendering, and the
 * dark values resolve to exactly the literals this used to hardcode.
 */
export function useChartTheme() {
  return CHART_THEME;
}

const CHART_THEME = {
  grid: "var(--chart-grid)",
  tick: { fontSize: 11, fill: "var(--color-outline)" },
  tooltip: {
    contentStyle: {
      backgroundColor: "var(--chart-tooltip-bg)",
      border: "1px solid color-mix(in srgb, var(--color-outline) 24%, transparent)",
      borderRadius: 12,
      boxShadow: "var(--chart-tooltip-shadow)",
    },
    labelStyle: { color: "var(--color-on-surface)", fontFamily: "Manrope", fontWeight: 600 },
    itemStyle: { color: "var(--color-on-surface-variant)" },
  },
} as const;
