import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHART_CHROME,
  CHROME_HEX,
  MAGNITUDE_RAMP_3,
  MAGNITUDE_RAMP_HEX,
  METRIC_COLOR,
  SERIES,
  SERIES_HEX,
  SLEEP_STAGE_COLOR,
  HR_ZONE_COLOR,
  READINESS_BAND_COLOR,
  STATUS,
  STATUS_HEX,
  metricColor,
  type ChartMode,
} from "../components/charts/chartPalette";

/**
 * The palette was previously 77 hex literals across 25 files, which is
 * how it drifted into failing three of five accessibility checks against
 * the chart surface without anyone noticing. These tests pin the
 * properties that keep that from happening again: the validated slots are
 * exactly what ships in BOTH modes, and no component re-introduces a raw
 * literal.
 *
 * Components hold `var(--chart-*)` references; index.css resolves them per
 * mode. The colour-science validation itself is an offline tool
 * (validate_palette.js: OKLab/CVD ΔE, lightness band, 3:1 contrast — dark
 * against the dark card, light with `--mode light --surface #ffffff`).
 * What this guards is that the *validated output* stays in place.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = readFileSync(join(SRC, "index.css"), "utf8");
const MODES: ChartMode[] = ["dark", "light"];

/** The exact slots validated per mode (8-slot adjacent runs). */
const VALIDATED: Record<ChartMode, string[]> = {
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9", "#008300", "#e66767"],
  light: ["#2a78d6", "#eb6834", "#01a772", "#c58506", "#db6f99", "#6250d6", "#008300", "#d94a4a"],
};

/** `--chart-*` values declared in one mode's block of index.css. */
function cssBlock(mode: ChartMode): Record<string, string> {
  const start = CSS.indexOf(`/* ${mode}-start */`);
  const end = CSS.indexOf(`/* ${mode}-end */`, start);
  if (start < 0 || end < 0) throw new Error(`${mode} block missing from index.css`);
  const out: Record<string, string> = {};
  for (const m of CSS.slice(start, end).matchAll(/--(chart-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

/** "var(--chart-3)" → "chart-3" */
function varName(ref: string): string {
  const m = ref.match(/^var\(--([a-z0-9-]+)\)$/);
  if (!m) throw new Error(`${ref} is not a var() reference`);
  return m[1];
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      return entry === "__tests__" ? [] : walk(p);
    }
    return /\.tsx?$/.test(entry) ? [p] : [];
  });
}

const slotIndex = (ref: string) => (SERIES as readonly string[]).indexOf(ref);

describe("chart palette", () => {
  for (const mode of MODES) {
    it(`ships exactly the validated ${mode} slots, in order`, () => {
      expect([...SERIES_HEX[mode]]).toEqual(VALIDATED[mode]);
    });

    it(`index.css resolves every ${mode} chart variable to the validated hex`, () => {
      const css = cssBlock(mode);
      SERIES.forEach((ref, i) => expect(css[varName(ref)], ref).toBe(SERIES_HEX[mode][i]));
      for (const key of ["good", "warning", "critical"] as const) {
        expect(css[varName(STATUS[key])], `STATUS.${key}`).toBe(STATUS_HEX[mode][key]);
      }
      for (const key of ["grid", "axis", "inactive", "overlay"] as const) {
        expect(css[varName(CHART_CHROME[key])], `CHART_CHROME.${key}`).toBe(CHROME_HEX[mode][key]);
      }
      MAGNITUDE_RAMP_3.forEach((ref, i) =>
        expect(css[varName(ref)], ref).toBe(MAGNITUDE_RAMP_HEX[mode][i]),
      );
    });

    it(`never paints a ${mode} series with that mode's status colour`, () => {
      const status: string[] = Object.values(STATUS_HEX[mode]);
      for (const slot of SERIES_HEX[mode]) {
        expect(status, `${slot} collides with a status colour`).not.toContain(slot);
      }
    });

    it(`steps the ${mode} magnitude ramp AWAY from the surface`, () => {
      // Dark: lighter = more. Light: darker = more. Either way the last
      // step is the one furthest from the card.
      const lum = (hex: string) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const values = MAGNITUDE_RAMP_HEX[mode].map(lum);
      const sorted = [...values].sort((x, y) => (mode === "dark" ? x - y : y - x));
      expect(values).toEqual(sorted);
    });
  }

  it("keeps every hue family in the same slot across modes", () => {
    // Identity is the SLOT; only the tone changes per mode. A metric that
    // is blue in dark must be blue in light.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    SERIES_HEX.dark.forEach((dark, i) => {
      const light = SERIES_HEX.light[i];
      const diff = Math.abs(hue(dark) - hue(light));
      expect(Math.min(diff, 360 - diff), `slot ${i + 1}: ${dark} vs ${light}`).toBeLessThan(25);
    });
  });

  it("assigns every metric a colour drawn from the validated slots", () => {
    for (const [metric, color] of Object.entries(METRIC_COLOR)) {
      expect(slotIndex(color), `${metric} uses an off-palette colour`).toBeGreaterThanOrEqual(0);
    }
  });

  it("falls back to a real slot for an unknown metric", () => {
    expect(slotIndex(metricColor("not_a_metric"))).toBeGreaterThanOrEqual(0);
  });

  it("keeps stacked sets on consecutive slots (that is what was validated)", () => {
    // Adjacency was validated in slot order; a stacked chart that skips
    // around the palette is not covered by that check.
    const stages = Object.values(SLEEP_STAGE_COLOR);
    const zones = Object.values(HR_ZONE_COLOR);
    for (const set of [stages, zones]) {
      const indices = set.map(slotIndex);
      expect(indices).toEqual([...indices].sort((a, b) => a - b));
      expect(indices).toEqual(indices.map((_, i) => indices[0] + i));
    }
  });

  it("never paints a series with a reserved status colour", () => {
    const status: string[] = Object.values(STATUS);
    for (const slot of SERIES) {
      expect(status, `${slot} collides with a status colour`).not.toContain(slot);
    }
  });

  it("uses status colours for readiness bands, which are state not identity", () => {
    expect(READINESS_BAND_COLOR.primed).toBe(STATUS.good);
    expect(READINESS_BAND_COLOR.compromised).toBe(STATUS.critical);
  });

  it("no component hardcodes a hex colour outside the palette and theme modules", () => {
    // A hex literal in a component is a colour that cannot follow the
    // theme: it is the same in light and dark. Route it through a token
    // (`var(--color-*)`) or a palette role instead.
    const ALLOWED = [/chartPalette\.ts$/, /stores[\\/]themeStore\.ts$/];
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (ALLOWED.some((re) => re.test(file))) continue;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/["'`](#[0-9a-fA-F]{3,8})\b/g)) {
        offenders.push(`${file.slice(SRC.length + 1)} → ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
