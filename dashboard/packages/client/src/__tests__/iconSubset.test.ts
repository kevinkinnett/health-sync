import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error -- plain .mjs build script, no type declarations
import { usedIconNames } from "../../scripts/iconNames.mjs";

/**
 * The app ships a SUBSET of the Material Symbols font. An icon missing from
 * it doesn't error — the ligature just doesn't fire, and the icon's NAME
 * renders as literal text ("fitness_center") in the middle of the UI.
 */
describe("Material Symbols subset", () => {
  it("contains every icon name the source uses", () => {
    const shipped: string[] = JSON.parse(
      readFileSync(join(__dirname, "../assets/icons/material-symbols-outlined.icons.json"), "utf8"),
    );
    const missing = (usedIconNames() as string[]).filter((n) => !shipped.includes(n));
    expect(missing, "icons used but not in the subset — run `pnpm icons:subset`").toEqual([]);
  });

  it("is what the app loads, not the full font", () => {
    const main = readFileSync(join(__dirname, "../main.tsx"), "utf8");
    expect(main).toContain("./assets/icons/material-symbols-outlined.css");
    expect(main).not.toContain("@material-symbols/font-400/outlined.css");
  });
});
