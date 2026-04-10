import sharp from "sharp";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(resolve(__dirname, "../public/health-icon.svg"));

const sizes = [64, 192, 512];

for (const size of sizes) {
  await sharp(svg).resize(size, size).png().toFile(
    resolve(__dirname, `../public/icon-${size}.png`),
  );
  console.log(`Generated icon-${size}.png`);
}

// Apple touch icon (180x180)
await sharp(svg).resize(180, 180).png().toFile(
  resolve(__dirname, "../public/apple-touch-icon.png"),
);
console.log("Generated apple-touch-icon.png");
