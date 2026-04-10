import { create } from "zustand";

export type PresetRange = "7d" | "30d" | "90d" | "all";

interface DateRangeState {
  start: string;
  end: string;
  preset: PresetRange;
  setPreset: (preset: PresetRange) => void;
  setCustomRange: (start: string, end: string) => void;
}

function computeDates(preset: PresetRange): { start: string; end: string } {
  const end = new Date();
  const endStr = end.toISOString().slice(0, 10);

  if (preset === "all") {
    return { start: "2020-01-01", end: endStr };
  }

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const start = new Date(end);
  start.setDate(end.getDate() - days);
  return { start: start.toISOString().slice(0, 10), end: endStr };
}

const initial = computeDates("30d");

export const useDateRangeStore = create<DateRangeState>((set) => ({
  start: initial.start,
  end: initial.end,
  preset: "30d",
  setPreset: (preset) => {
    const { start, end } = computeDates(preset);
    set({ start, end, preset });
  },
  setCustomRange: (start, end) => {
    set({ start, end, preset: "30d" });
  },
}));
