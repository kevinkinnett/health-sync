import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyClass(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
}

const savedMode =
  (localStorage.getItem("theme") as ThemeMode) || "system";
const initialIsDark = resolveIsDark(savedMode);
applyClass(initialIsDark);

export const useThemeStore = create<ThemeState>((set) => ({
  mode: savedMode,
  isDark: initialIsDark,
  setMode: (mode) => {
    localStorage.setItem("theme", mode);
    const isDark = resolveIsDark(mode);
    applyClass(isDark);
    set({ mode, isDark });
  },
}));

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    const { mode } = useThemeStore.getState();
    if (mode === "system") {
      const isDark = resolveIsDark("system");
      applyClass(isDark);
      useThemeStore.setState({ isDark });
    }
  });

export function useChartTheme() {
  const isDark = useThemeStore((s) => s.isDark);
  return {
    grid: isDark ? "#374151" : "#f0f0f0",
    tick: { fontSize: 11, fill: isDark ? "#9ca3af" : "#6b7280" },
    tooltip: {
      contentStyle: {
        backgroundColor: isDark ? "#1f2937" : "#fff",
        border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
        borderRadius: 8,
      },
      labelStyle: { color: isDark ? "#e5e7eb" : "#111827" },
      itemStyle: { color: isDark ? "#d1d5db" : "#374151" },
    },
  };
}
