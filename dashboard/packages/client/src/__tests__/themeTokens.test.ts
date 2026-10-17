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

type Mode = "dark" | "light";
const MODES: Mode[] = ["dark", "light"];

function between(text: string, open: string, close: string): string {
  const start = text.indexOf(open);
  const end = text.indexOf(close, start);
  if (start < 0 || end < 0) throw new Error(`${open} … ${close} not found in index.css`);
  return text.slice(start, end);
}

/**
 * Dark lives in the `@theme` block (the default) plus the dark chart
 * section of `:root`; light lives in the `:root.light` override. Each mode
 * is read from ITS OWN block, so a light token can't silently fall back to
 * the dark value and pass.
 */
const BLOCKS: Record<Mode, string> = {
  dark: between(CSS, "@theme {", "/* ── Fonts ── */") + between(CSS, "/* dark-start */", "/* dark-end */"),
  light: between(CSS, "/* light-start */", "/* light-end */"),
};

function token(name: string, mode: Mode = "dark"): string {
  const m = BLOCKS[mode].match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--color-${name} not found in the ${mode} block of index.css`);
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

const ACCENTS = ["primary", "secondary", "tertiary", "error"];

/**
 * Surfaces in elevation order. On dark every step is LIGHTER than the one
 * before (the Material convention). On light the card is white, and there
 * is nothing lighter than white — so the light ramp is ordered by distance
 * from the card: sub-panels, then wells, then the page, then raised chips
 * and popovers, each step DARKER than the last.
 */
const SURFACE_ORDER: Record<Mode, { names: string[]; direction: "lighter" | "darker" }> = {
  dark: {
    names: [
      "surface-container-lowest",
      "surface",
      "surface-container-low",
      "surface-container",
      "surface-container-high",
      "surface-container-highest",
      "surface-bright",
    ],
    direction: "lighter",
  },
  light: {
    names: [
      "surface-container",
      "surface-container-low",
      "surface-container-lowest",
      "surface",
      "surface-container-high",
      "surface-container-highest",
      "surface-bright",
    ],
    direction: "darker",
  },
};

for (const mode of MODES) {
  const t = (name: string) => token(name, mode);

  describe(`${mode} theme — accents are readable as text`, () => {
    for (const name of ACCENTS) {
      it(`${name} clears ${TEXT}:1 on both the page and a card`, () => {
        for (const bg of [PAGE, CARD]) {
          const ratio = contrast(t(name), t(bg));
          expect(ratio, `${name} on ${bg} is ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(TEXT);
        }
      });
    }

    it(`outline, used as muted text, clears ${TEXT}:1 on the page and a card`, () => {
      for (const bg of [PAGE, CARD]) {
        const ratio = contrast(t("outline"), t(bg));
        expect(ratio, `outline on ${bg} is ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(TEXT);
      }
    });
  });

  describe(`${mode} theme — neutral surfaces stay neutral and ordered`, () => {
    const { names, direction } = SURFACE_ORDER[mode];

    it("keeps every surface close to a neutral gray", () => {
      for (const name of names) {
        expect(channelSpread(t(name)), `${name} has a visible color cast`).toBeLessThanOrEqual(18);
      }
    });

    it(`makes each elevation step ${direction} than the one before it`, () => {
      const values = names.map((name) => luminance(t(name)));
      for (let index = 1; index < values.length; index += 1) {
        if (direction === "lighter") {
          expect(values[index], names[index]).toBeGreaterThan(values[index - 1]);
        } else {
          expect(values[index], names[index]).toBeLessThan(values[index - 1]);
        }
      }
    });

    it("separates cards from the page", () => {
      // A card the same tone as the page has no edge but its border.
      expect(contrast(t(CARD), t(PAGE))).toBeGreaterThanOrEqual(1.1);
    });

    it("keeps primary and secondary text neutral rather than tinted", () => {
      for (const name of ["on-surface", "on-surface-variant"]) {
        expect(channelSpread(t(name)), `${name} is visibly tinted`).toBeLessThanOrEqual(12);
      }
    });
  });

  describe(`${mode} theme — labels are readable on their own backgrounds`, () => {
    // Each pair is a real call site: `bg-primary` with `text-on-primary`,
    // and the gradient button (from-primary to-primary-container) with
    // `text-on-primary-fixed`, checked on BOTH ends: on dark the darker end
    // binds, on light (white label) the lighter one does.
    const pairs: [label: string, background: string][] = [
      ["on-primary", "primary"],
      ["on-primary-fixed", "primary"],
      ["on-primary-fixed", "primary-container"],
      ["on-secondary", "secondary-container"],
      ["on-tertiary", "tertiary-container"],
      ["on-error", "error"],
      ["on-error", "error-container"],
    ];

    for (const [label, background] of pairs) {
      it(`${label} clears ${TEXT}:1 on ${background}`, () => {
        const ratio = contrast(t(label), t(background));
        expect(ratio, `${label} on ${background} is ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(TEXT);
      });
    }
  });

  describe(`${mode} theme — accents are distinguishable from prose`, () => {
    it("no accent shares the weight of secondary body text", () => {
      // THE bug in the old palette. An accent at the same contrast as
      // on-surface-variant differs from the prose only by hue, and at low
      // chroma that is not enough to notice. Requiring real separation is
      // what forces accents into their own tier.
      const variant = contrast(t("on-surface-variant"), t(CARD));
      for (const name of ACCENTS) {
        const accent = contrast(t(name), t(CARD));
        expect(
          Math.abs(accent - variant),
          `${name} sits at ${accent.toFixed(2)} vs on-surface-variant ${variant.toFixed(2)}`,
        ).toBeGreaterThan(1.5);
      }
    });

    it("keeps the ink ramp ordered: body stronger than variant, stronger than outline", () => {
      const body = contrast(t("on-surface"), t(CARD));
      const variant = contrast(t("on-surface-variant"), t(CARD));
      const outline = contrast(t("outline"), t(CARD));
      expect(body).toBeGreaterThan(variant);
      expect(variant).toBeGreaterThan(outline);
      expect(outline).toBeGreaterThanOrEqual(3);
    });
  });

  describe(`${mode} theme — the retired palette stays retired`, () => {
    it("no accent token is one of the pastels that failed validation", () => {
      // #c0c1ff / #ffb2b7 measured ΔE 12.7 apart under NORMAL vision, below
      // the 15 floor. The chart palette already bans these; the chrome kept
      // using them for months after the charts stopped.
      const RETIRED = ["#c0c1ff", "#4edea3", "#ffb2b7", "#8083ff", "#ffb4ab", "#ffd479", "#7fd1ff"];
      for (const name of ["primary", "primary-container", "secondary", "tertiary", "error"]) {
        expect(RETIRED, `--color-${name} is a retired pastel`).not.toContain(t(name));
      }
    });
  });
}

describe("light theme — redefines every dark token", () => {
  it("leaves no colour token to fall through to the dark value", () => {
    const names = [...BLOCKS.dark.matchAll(/--color-([a-z-]+):/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(20);
    for (const name of names) {
      expect(() => token(name, "light"), `--color-${name}`).not.toThrow();
    }
  });
});

describe("browser and PWA chrome stay synchronized", () => {
  const html = readFileSync(join(CLIENT_ROOT, "index.html"), "utf8");
  const store = readFileSync(join(CLIENT_ROOT, "src", "stores", "themeStore.ts"), "utf8");

  it("uses the dark page surface for installed and default browser chrome", () => {
    const viteConfig = readFileSync(join(CLIENT_ROOT, "vite.config.ts"), "utf8");
    const surface = token("surface", "dark");

    expect(html).toContain(`<meta name="theme-color" content="${surface}"`);
    expect(viteConfig).toContain(`theme_color: "${surface}"`);
    expect(viteConfig).toContain(`background_color: "${surface}"`);
  });

  it("swaps browser chrome to the light page surface in light mode", () => {
    const light = token("surface", "light");
    // The pre-paint script and the store both rewrite the meta tag.
    expect(html).toContain(`"${light}"`);
    expect(store).toContain(`light: "${light}"`);
    expect(store).toContain(`dark: "${token("surface", "dark")}"`);
  });

  it("no longer hardcodes a mode on <html>: the pre-paint script picks it", () => {
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('localStorage.getItem("vitalis.theme")');
    expect(store).toContain('THEME_STORAGE_KEY = "vitalis.theme"');
  });
});
