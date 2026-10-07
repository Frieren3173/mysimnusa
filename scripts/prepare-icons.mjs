// prepare-icons.mjs — build favicon / app icons from the LEFT emblem only.
//
// The combined 4-logo strip is unreadable at 32px, so the favicon uses a single
// emblem: the Lambang Kejaksaan RI (the leftmost logo). It is cropped to a
// square, padded onto a transparent (and, for the .ico, white) canvas, and
// scaled down.
//
// Outputs (App Router file conventions):
//   src/app/icon.png        512x512  (transparent)
//   src/app/apple-icon.png  180x180  (white background — iOS ignores alpha)
//   src/app/favicon.ico      16/32/48
//
// Source (kept out of public/): assets-raw/logo/logo-all.png
// Usage: node scripts/prepare-icons.mjs

import sharp from "sharp";
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "assets-raw", "logo", "logo-all.png");
const APP = path.join(ROOT, "src", "app");

if (!fs.existsSync(SRC)) {
  console.error(`source logo not found: ${SRC}`);
  process.exit(1);
}

// The left emblem occupies x:0..279 of the trimmed strip (measured). Trim first
// so the crop is deterministic, then take the left emblem region.
const trimmed = await sharp(SRC).trim({ threshold: 10 }).png().toBuffer();
const tMeta = await sharp(trimmed).metadata();
const emblemWidth = 280; // leftmost emblem = Lambang Kejaksaan
const emblem = await sharp(trimmed)
  .extract({ left: 0, top: 0, width: Math.min(emblemWidth, tMeta.width), height: tMeta.height })
  .png()
  .toBuffer();

// Square canvas with SAFE padding (~12%) so the emblem is never clipped by a
// circular/rounded launcher mask, centred on transparency.
// The emblem is composited per target size inside onCanvas() below.
async function onCanvas(size, background) {
  // Render the emblem into a transparent square canvas of `size`, with padding.
  const padded = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();

  const innerSize = Math.round(size * 0.76);
  const emblemScaled = await sharp(emblem)
    .resize({
      width: innerSize,
      height: innerSize,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const eMeta = await sharp(emblemScaled).metadata();
  const ew = eMeta.width ?? innerSize;
  const eh = eMeta.height ?? innerSize;

  const base = background.a === 0
    ? sharp(padded)
    : sharp({ create: { width: size, height: size, channels: 4, background } }).png();

  return base
    .composite([
      {
        input: emblemScaled,
        left: Math.round((size - ew) / 2),
        top: Math.round((size - eh) / 2),
      },
    ])
    .png();
}

// 1) icon.png — 512, transparent.
(await onCanvas(512, { r: 0, g: 0, b: 0, alpha: 0 })).toFile(path.join(APP, "icon.png"));

// 2) apple-icon.png — 180, white background (iOS does not honour alpha).
(await onCanvas(180, { r: 255, g: 255, b: 255, alpha: 1 })).toFile(path.join(APP, "apple-icon.png"));

// 2b) manifest icons — 192/512 PNGs served from /public for the web manifest.
await (await onCanvas(192, { r: 0, g: 0, b: 0, alpha: 0 })).toFile(path.join(ROOT, "public", "icon-192.png"));
await (await onCanvas(512, { r: 0, g: 0, b: 0, alpha: 0 })).toFile(path.join(ROOT, "public", "icon-512.png"));

// 3) favicon.ico — 16 / 32 / 48, white background (favicons look bad transparent
// on many dark browser UIs, and the emblem reads better on a light chip).
const icoSizes = [16, 32, 48];
const pngs = await Promise.all(
  icoSizes.map(async (s) => (await onCanvas(s, { r: 255, g: 255, b: 255, alpha: 1 })).png().toBuffer()),
);
// Sharp cannot emit multi-image .ico directly; build the ICO container (PNG-in-ICO,
// supported by all modern browsers) by hand.
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, buf } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.buf)]);
}
const ico = buildIco(icoSizes.map((size, i) => ({ size, buf: pngs[i] })));
fs.writeFileSync(path.join(APP, "favicon.ico"), ico);

console.log("── icon assets ──");
for (const f of ["icon.png", "apple-icon.png", "favicon.ico"]) {
  const kb = Math.round(fs.statSync(path.join(APP, f)).size / 1024);
  console.log(`  src/app/${f.padEnd(16)} ${String(kb).padStart(4)} KB`);
}
for (const f of ["icon-192.png", "icon-512.png"]) {
  const kb = Math.round(fs.statSync(path.join(ROOT, "public", f)).size / 1024);
  console.log(`  public/${f.padEnd(17)} ${String(kb).padStart(4)} KB`);
}
console.log(`emblem source: ${tMeta.width}x${tMeta.height}, crop width ${emblemWidth}px`);
