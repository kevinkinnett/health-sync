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
    grid: "#222a3d",
    tick: { fontSize: 11, fill: "#908fa0" },
    tooltip: {
      contentStyle: {
        backgroundColor: "#171f33",
        border: "1px solid rgba(70, 69, 84, 0.15)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      },
      labelStyle: { color: "#dae2fd", fontFamily: "Manrope", fontWeight: 600 },
      itemStyle: { color: "#c7c4d7" },
    },
  };
}
