/**
 * Rebuilds the Material Symbols subset the app ships.
 *
 * The full outlined font is ~477 KiB of woff2 — bigger than any JS chunk,
 * precached by the service worker, and blocking every icon in the shell
 * until it lands — for the ~100 icons the app uses. This keeps only those.
 *
 *   pnpm icons:subset      (needs Python with `pip install fonttools brotli`)
 *
 * Run it after using a new icon; `iconSubset.test.ts` fails until you do.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ALL_NAMES_FILE, usedIconNames } from "./iconNames.mjs";

const CLIENT = resolve(import.meta.dirname, "..");
const OUT_DIR = join(CLIENT, "src/assets/icons");
const manifest = join(OUT_DIR, "material-symbols-outlined.icons.json");

const FULL = join(CLIENT, "node_modules/@material-symbols/font-400/material-symbols-outlined.woff2");
const python = (...args) =>
  execFileSync(
    process.env.PYTHON ?? "python",
    [join(CLIENT, "scripts/subset_material_symbols.py"), ...args],
    { stdio: "inherit" },
  );

// 1. What the full font can render (also what the unit test checks against).
python("--list", FULL, ALL_NAMES_FILE);
// 2. What the source asks for.
const names = usedIconNames();
writeFileSync(manifest, JSON.stringify(names, null, 2) + "\n");
// 3. Keep exactly those.
python(FULL, manifest, join(OUT_DIR, "material-symbols-outlined-subset.woff2"));
