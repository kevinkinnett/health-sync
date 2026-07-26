import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  METRIC_COLOR,
  SERIES,
  SLEEP_STAGE_COLOR,
  HR_ZONE_COLOR,
  READINESS_BAND_COLOR,
  STATUS,
  metricColor,
} from "../components/charts/chartPalette";

/**
 * The palette was previously 77 hex literals across 25 files, which is
 * how it drifted into failing three of five accessibility checks against
 * the chart surface without anyone noticing. These tests pin the two
 * properties that keep that from happening again: the validated slots are
 * exactly what shipped, and no component re-introduces a raw literal.
 *
 * The colour-science validation itself is not re-run here — it is a
 * separate offline tool (OKLab/CVD ΔE against surface #171f33). What this
 * guards is that the *validated output* stays in place.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The exact slots validated for surface #171f33 (8-slot adjacent run). */
const VALIDATED = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#9085e9",
  "#008300",
  "#e66767",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      return entry === "__tests__" ? [] : walk(p);
    }
    return /\.tsx?$/.test(entry) ? [p] : [];
  });
}

describe("chart palette", () => {
  it("ships exactly the validated slots, in order", () => {
    expect([...SERIES]).toEqual(VALIDATED);
  });

  it("assigns every metric a colour drawn from the validated slots", () => {
    for (const [metric, color] of Object.entries(METRIC_COLOR)) {
      expect(VALIDATED, `${metric} uses an off-palette colour`).toContain(color);
    }
  });

  it("falls back to a real slot for an unknown metric", () => {
    expect(VALIDATED).toContain(metricColor("not_a_metric"));
  });

  it("keeps stacked sets on consecutive slots (that is what was validated)", () => {
    // Adjacency was validated in slot order; a stacked chart that skips
    // around the palette is not covered by that check.
    const stages = Object.values(SLEEP_STAGE_COLOR);
    const zones = Object.values(HR_ZONE_COLOR);
    for (const set of [stages, zones]) {
      const indices = set.map((c) => VALIDATED.indexOf(c));
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

  it("no component hardcodes a series colour outside the palette module", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (/chartPalette\.ts$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/"(#[0-9a-fA-F]{6})"/g)) {
        if (VALIDATED.includes(m[1].toLowerCase())) {
          offenders.push(`${file.slice(SRC.length + 1)} → ${m[1]}`);
        }
      }
    }
    // A validated hex appearing verbatim outside the module means someone
    // copied a value instead of importing the role it stands for.
    expect(offenders).toEqual([]);
  });
});
