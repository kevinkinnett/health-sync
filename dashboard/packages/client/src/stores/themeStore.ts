import { create } from "zustand";

export type ThemeMode = "dark";

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>(() => ({
  mode: "dark",
  isDark: true,
  setMode: () => {
    // dark-only design system
  },
}));

export function useChartTheme() {
  return {
    grid: "#2a2f36",
    tick: { fontSize: 11, fill: "#8b929c" },
    tooltip: {
      contentStyle: {
        backgroundColor: "#20242a",
        border: "1px solid rgba(139, 146, 156, 0.24)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      },
      labelStyle: { color: "#f1f3f5", fontFamily: "Manrope", fontWeight: 600 },
      itemStyle: { color: "#c4c8ce" },
    },
  };
}
