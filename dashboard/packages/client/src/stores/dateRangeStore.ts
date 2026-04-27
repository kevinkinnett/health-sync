import { create } from "zustand";
import { addDays, detectBrowserTz, todayInTz } from "../lib/userTz";

export type PresetRange = "7d" | "30d" | "90d" | "all";

interface DateRangeState {
  start: string;
  end: string;
  preset: PresetRange;
  /** IANA timezone the dates are computed in. */
  tz: string;
  setPreset: (preset: PresetRange) => void;
  setCustomRange: (start: string, end: string) => void;
  /**
   * Reconciles the store's TZ with the server-configured user TZ. Called
   * once `useAppConfig` resolves so date math runs in the user's intended
   * zone rather than the browser's. Recomputes the active preset's window
   * if the TZ actually changed.
   */
  setTz: (tz: string) => void;
}

/**
 * Computes the [start, end] window for `preset` in `tz`. Uses calendar-day
 * arithmetic (via `addDays`) rather than millisecond subtraction, so DST
 * transitions don't shift the boundary by an hour.
 */
function computeDates(
  preset: PresetRange,
  tz: string,
): { start: string; end: string } {
  const end = todayInTz(tz);
  if (preset === "all") {
    return { start: "2020-01-01", end };
  }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  return { start: addDays(end, -days), end };
}

const initialTz = detectBrowserTz();
const initial = computeDates("30d", initialTz);

export const useDateRangeStore = create<DateRangeState>((set, get) => ({
  start: initial.start,
  end: initial.end,
  preset: "30d",
  tz: initialTz,
  setPreset: (preset) => {
    const { tz } = get();
    const { start, end } = computeDates(preset, tz);
    set({ start, end, preset });
  },
  setCustomRange: (start, end) => {
    set({ start, end, preset: "30d" });
  },
  setTz: (tz) => {
    const current = get();
    if (current.tz === tz) return;
    // Recompute the current preset's window in the new TZ. Custom ranges
    // and "all" are absolute strings, so they don't change — only the
    // rolling presets shift.
    if (current.preset === "all") {
      set({ tz });
      return;
    }
    const { start, end } = computeDates(current.preset, tz);
    set({ tz, start, end });
  },
}));
