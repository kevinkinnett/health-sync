import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const KiB = 1024;
const budgets = {
  entry: 225 * KiB,
  chunk: 260 * KiB,
  // UX-audit fixes (route error boundaries, delete confirms, insight start errors) measured 1502.1 KiB; ~1.9 KiB margin.
  javascriptTotal: 1504 * KiB,
  // Recovery logging and matched-effect reporting add a full responsive
  // workflow. UX-audit fixes brought it to 71.3 KiB; keep ~1.7 KiB margin.
  css: 73 * KiB,
  // The Material Symbols SUBSET (scripts/subsetIcons.mjs) is ~17 KiB. The
  // full font is ~477 KiB, so a regression to it cannot slip under this.
  iconFont: 48 * KiB,
};

const assets = resolve(process.cwd(), "dist/assets");
const files = await readdir(assets);
const sizes = new Map(await Promise.all(files.map(async (name) => [
  name,
  (await stat(resolve(assets, name))).size,
])));

const js = [...sizes].filter(([name]) => name.endsWith(".js"));
const css = [...sizes].filter(([name]) => name.endsWith(".css"));
const failures = [];
const report = (label, actual, budget) => {
  const line = `${label}: ${(actual / KiB).toFixed(1)} KiB / ${(budget / KiB).toFixed(0)} KiB`;
  if (actual > budget) failures.push(line);
  else console.log(`✓ ${line}`);
};

const entry = js.find(([name]) => /^index-[^.]+\.js$/.test(name));
if (!entry) failures.push("Could not identify the Vite index JavaScript entry");
else report(`initial entry (${entry[0]})`, entry[1], budgets.entry);

const largest = js.reduce((max, item) => item[1] > max[1] ? item : max, ["none", 0]);
report(`largest JS chunk (${largest[0]})`, largest[1], budgets.chunk);
report("all JavaScript", js.reduce((sum, [, size]) => sum + size, 0), budgets.javascriptTotal);
for (const [name, size] of css) report(`stylesheet (${name})`, size, budgets.css);

const iconFonts = [...sizes].filter(([name]) => /^material-symbols.*\.woff2$/.test(name));
if (!iconFonts.length) failures.push("Could not find the Material Symbols icon font");
for (const [name, size] of iconFonts) report(`icon font (${name})`, size, budgets.iconFont);

if (failures.length) {
  console.error("Bundle budget exceeded:\n" + failures.map((line) => `  ✗ ${line}`).join("\n"));
  process.exitCode = 1;
}
