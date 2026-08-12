import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The dark theme's colour contract, as arithmetic.
 *
 * These tokens are the kind of thing that gets regenerated wholesale by a
 * theme tool and pasted in, which is exactly how the previous set arrived:
 * a Material tone-80 ramp where all four accents landed at 9.6 contrast —
 * the same weight as secondary body text — and three of them fell below
 * the chroma floor, i.e. measurably "reads gray". The app looked washed
 * out for months and nothing could say why.
 *
 * Nothing here is a matter of taste. Each assertion is a WCAG ratio.
 */

const CSS = readFileSync(
  join(__dirname, "..", "index.css"),
  "utf8",
);
const CLIENT_ROOT = join(__dirname, "..", "..");

function token(name: string): string {
  const m = CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--color-${name} not found in index.css`);
  return m[1].toLowerCase();
}

const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function channelSpread(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(...channels) - Math.min(...channels);
}

const PAGE = "surface";
const CARD = "surface-container";

/** WCAG AA for normal-size text. */
const TEXT = 4.5;

describe("dark theme — accents are readable as text", () => {
  for (const name of ["primary", "secondary", "tertiary", "error"]) {
    it(`${name} clears ${TEXT}:1 on both the page and a card`, () => {
      for (const bg of [PAGE, CARD]) {
        const ratio = contrast(token(name), token(bg));
        expect(ratio, `${name} on ${bg} is ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(TEXT);
      }
    });
  }
});

describe("dark theme — graphite surfaces stay neutral and ordered", () => {
  const surfaces = [
    "surface-container-lowest",
    "surface",
    "surface-container-low",
    "surface-container",
    "surface-container-high",
    "surface-container-highest",
    "surface-bright",
  ];

  it("keeps every surface close to a neutral gray", () => {
    for (const name of surfaces) {
      expect(
        channelSpread(token(name)),
        `${name} has a visible color cast`,
      ).toBeLessThanOrEqual(18);
    }
  });

  it("makes each elevation step lighter than the one below it", () => {
    const values = surfaces.map((name) => luminance(token(name)));
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index], surfaces[index]).toBeGreaterThan(values[index - 1]);
    }
  });

  it("keeps primary and secondary text neutral rather than lavender", () => {
    for (const name of ["on-surface", "on-surface-variant"]) {
      expect(channelSpread(token(name)), `${name} is visibly tinted`).toBeLessThanOrEqual(12);
    }
  });
});

describe("dark theme — browser and PWA chrome stay synchronized", () => {
  it("uses the page surface for installed and browser chrome", () => {
    const html = readFileSync(join(CLIENT_ROOT, "index.html"), "utf8");
    const viteConfig = readFileSync(join(CLIENT_ROOT, "vite.config.ts"), "utf8");
    const surface = token("surface");

    expect(html).toContain(`<meta name="theme-color" content="${surface}"`);
    expect(viteConfig).toContain(`theme_color: "${surface}"`);
    expect(viteConfig).toContain(`background_color: "${surface}"`);
  });
});

describe("dark theme — labels are readable on their own backgrounds", () => {
  // Each pair is a real call site: `bg-primary` with `text-on-primary`,
  // and the gradient button whose label must survive the DARKER end.
  const pairs: [label: string, background: string][] = [
    ["on-primary", "primary"],
    ["on-primary-fixed", "primary-container"],
    ["on-secondary", "secondary-container"],
    ["on-tertiary", "tertiary-container"],
    ["on-error", "error-container"],
  ];

  for (const [label, background] of pairs) {
    it(`${label} clears ${TEXT}:1 on ${background}`, () => {
      const ratio = contrast(token(label), token(background));
      expect(ratio, `${label} on ${background} is ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(TEXT);
    });
  }
});

describe("dark theme — accents are distinguishable from prose", () => {
  it("no accent shares the weight of secondary body text", () => {
    // THE bug in the old palette. An accent at the same contrast as
    // on-surface-variant differs from the prose only by hue, and at low
    // chroma that is not enough to notice. Requiring real separation is
    // what forces accents into their own tier.
    const variant = contrast(token("on-surface-variant"), token(CARD));
    for (const name of ["primary", "secondary", "tertiary", "error"]) {
      const accent = contrast(token(name), token(CARD));
      expect(
        Math.abs(accent - variant),
        `${name} sits at ${accent.toFixed(2)} vs on-surface-variant ${variant.toFixed(2)}`,
      ).toBeGreaterThan(1.5);
    }
  });

  it("keeps the ink ramp ordered: body brighter than variant, brighter than outline", () => {
    const body = contrast(token("on-surface"), token(CARD));
    const variant = contrast(token("on-surface-variant"), token(CARD));
    const outline = contrast(token("outline"), token(CARD));
    expect(body).toBeGreaterThan(variant);
    expect(variant).toBeGreaterThan(outline);
    expect(outline).toBeGreaterThanOrEqual(3);
  });
});

describe("dark theme — the retired palette stays retired", () => {
  it("no accent token is one of the pastels that failed validation", () => {
    // #c0c1ff / #ffb2b7 measured ΔE 12.7 apart under NORMAL vision, below
    // the 15 floor. The chart palette already bans these; the chrome kept
    // using them for months after the charts stopped.
    const RETIRED = ["#c0c1ff", "#4edea3", "#ffb2b7", "#8083ff", "#ffb4ab", "#ffd479", "#7fd1ff"];
    for (const name of ["primary", "primary-container", "secondary", "tertiary", "error"]) {
      expect(RETIRED, `--color-${name} is a retired pastel`).not.toContain(token(name));
    }
  });
});
