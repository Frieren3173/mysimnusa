// prepare-logo.mjs — build the MYSIMNUSA combined logo assets.
//
// Source : assets-raw/logo/logo-all.png  (2000×400 PNG, transparent, 4 logos)
// Outputs (public/assets/logo/):
//   logo-1000.webp / logo-1000.png   → 1000×~144  (1x)
//   logo-2000.webp / logo-2000.png   → 2000×~288  (2x, retina)
//   og-image.png                     → 1200×630 (logo on white) for social cards
//
// Uses sharp (already a dependency). Trims the transparent padding top/bottom so
// the strip sits flush, then encodes WebP q85 + PNG fallback. Each file < 100 KB.
//
// Usage: node scripts/prepare-logo.mjs

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "assets-raw", "logo", "logo-all.png");
const OUT = path.join(ROOT, "public", "assets", "logo");

if (!fs.existsSync(SRC)) {
  console.error(`source logo not found: ${SRC}`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

// 1) Trim transparent padding (top/bottom) and keep the true content bounds.
const trimmed = await sharp(SRC).trim({ threshold: 10 }).png().toBuffer();
const tMeta = await sharp(trimmed).metadata();
console.log(`trimmed source: ${tMeta.width}x${tMeta.height}`);

// 2) Normal sizes: 2000 wide (@2x) and 1000 wide (1x), transparent.
async function write(basename, width) {
  const height = Math.round((tMeta.height / tMeta.width) * width);
  await sharp(trimmed).resize({ width }).webp({ quality: 85, effort: 6 }).toFile(path.join(OUT, `${basename}.webp`));
  await sharp(trimmed).resize({ width }).png({ compressionLevel: 9 }).toFile(path.join(OUT, `${basename}.png`));
  return height;
}
const h1000 = await write("logo-1000", 1000);
const h2000 = await write("logo-2000", 2000);

// 3) og:image — 1200×630, logo on a clean white canvas (centered, padded).
const ogW = 1200;
const ogH = 630;
const logoW = 1000;
const logoH = Math.round((tMeta.height / tMeta.width) * logoW);
const logoBuf = await sharp(trimmed).resize({ width: logoW }).png().toBuffer();
await sharp({
  create: { width: ogW, height: ogH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
})
  .composite([{ input: logoBuf, top: Math.round((ogH - logoH) / 2), left: Math.round((ogW - logoW) / 2) }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(OUT, "og-image.png"));

// 4) Report
console.log("\n── logo assets ──");
for (const f of fs.readdirSync(OUT).sort()) {
  const kb = Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
  console.log(`  ${f.padEnd(18)} ${String(kb).padStart(4)} KB`);
}
console.log(`\n1x: 1000x${h1000} · 2x: 2000x${h2000} · og: 1200x${ogH}`);
