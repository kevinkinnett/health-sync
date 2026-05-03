import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { defaultUnitsForLocale, type UnitSystem } from "../lib/units";

interface UnitsState {
  units: UnitSystem;
  setUnits: (u: UnitSystem) => void;
}

/**
 * User preference for displayed measurement system. Persisted to
 * localStorage so the choice survives reloads and PWA cold starts.
 *
 * The store is intentionally tiny — all conversion logic lives in
 * `lib/units.ts` so it can be exercised in plain unit tests without
 * mounting the store.
 *
 * On first load (no persisted value yet) we seed from the browser's
 * locale: US/LR/MM default to imperial, everything else to metric.
 * Users in those locales who actually want metric (or vice versa) flip
 * once and the choice sticks.
 */
export const useUnitsStore = create<UnitsState>()(
  persist(
    (set) => ({
      units: defaultUnitsForLocale(),
      setUnits: (units) => set({ units }),
    }),
    {
      name: "vitalis.units",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Convenience selector — components that only read the preference. */
export function useUnits(): UnitSystem {
  return useUnitsStore((s) => s.units);
}
