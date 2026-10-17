import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Which Material Symbols the app can ask the icon font for.
 *
 * Icons are ligatures: the font turns the TEXT "home" into the home glyph.
 * So an icon name is just a string somewhere in the source — in JSX text,
 * in a prop (`icon="fitness_center"`), in a nav config, in a ternary.
 * There is no import to follow, so this collects every string literal and
 * every bare JSX text token, and keeps the ones that are real icon names.
 *
 * That over-collects on purpose ("light", "list" and "start" are icons as
 * well as ordinary words). A spare glyph costs a few hundred bytes; a
 * missing one renders its name as literal text in the UI.
 *
 * Shared by the subset generator and by the unit test that fails when a
 * newly used icon is missing from the committed subset.
 */

const CLIENT = resolve(import.meta.dirname, "..");

/**
 * Every icon name the full font has a ligature for, as listed by
 * `subset_material_symbols.py --list` from the font's own GSUB table.
 *
 * Not the package's index.d.ts: that list is incomplete — it omits names
 * the font still renders (`auto_awesome`, `insights`), which then fell out
 * of the subset and showed up as literal text in the nav.
 */
export const ALL_NAMES_FILE = join(CLIENT, "src/assets/icons/material-symbols-outlined.all-names.txt");

export function allIconNames() {
  return new Set(readFileSync(ALL_NAMES_FILE, "utf8").split(/\r?\n/).filter(Boolean));
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.(tsx?|css)$/.test(entry.name)) yield path;
  }
}

const CANDIDATES = [
  /(["'`])([a-z0-9_]+)\1/g, //          "home", 'home', `home`
  />\s*([a-z0-9_]+)\s*</g, //           <span>home</span>
  /^\s*([a-z0-9_]+)\s*$/gm, //          a JSX text line on its own
  /\?\s*"([a-z0-9_]+)"\s*:\s*"([a-z0-9_]+)"/g, // cond ? "a" : "b"
];

/** Icon names referenced anywhere under src/, sorted. */
export function usedIconNames(srcDir = join(CLIENT, "src")) {
  const valid = allIconNames();
  const used = new Set();
  for (const file of sourceFiles(srcDir)) {
    const text = readFileSync(file, "utf8");
    for (const pattern of CANDIDATES) {
      for (const match of text.matchAll(pattern)) {
        for (const token of match.slice(1)) {
          if (token && valid.has(token)) used.add(token);
        }
      }
    }
  }
  return [...used].sort();
}
