// prepare-login-photos.mjs — build the login slideshow WebP images.
//
// Pipeline: HEIC → (ffmpeg) → temp JPEG → (sharp: auto-orient + resize + WebP)
//           JPEG →                     (sharp: auto-orient + resize + WebP)
//
// sharp in this environment cannot decode the iPhone HEIC bitstream (it reads
// metadata but fails with "bad seek"), while the bundled ffmpeg 9 ≠ does decode
// HEIF/HEVC. So HEIC files are transcoded with ffmpeg first, then sharp does
// the EXIF auto-orient, the 1920px resize and the WebP q75 encode.
//
// Excludes the two poster/kolase images whose text would be cropped.
// Usage: node scripts/prepare-login-photos.mjs

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "source-photos");
const OUT = path.join(ROOT, "public", "assets", "login");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "login-heic-"));

const EXCLUDE = ["IMG_3648", "IMG_4959"]; // poster/kolase → text would be cropped
const FIRST = "IMG_3636"; // preferred first slide (large uniformed group, faces clear)
const MAX_SIDE = 1920;
const QUALITY = 75;

function ffmpegBin() {
  return process.env.FFMPEG || "ffmpeg";
}

if (!fs.existsSync(SRC)) {
  console.error(`source folder not found: ${SRC}`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) {
  if (/\.webp$/i.test(f)) fs.rmSync(path.join(OUT, f));
}

const files = fs
  .readdirSync(SRC)
  .filter((f) => /\.(heic|heif|jpe?g)$/i.test(f))
  .filter((f) => !EXCLUDE.some((x) => f.includes(x)))
  .sort();

if (files.length === 0) {
  console.error("no source photos found");
  process.exit(1);
}

// Resolve, for each source, a JPEG buffer sharp can read. HEIC → ffmpeg → jpg.
function resolveForSharp(file) {
  const srcPath = path.join(SRC, file);
  if (/\.(heic|heif)$/i.test(file)) {
    const tmpOut = path.join(TMP, file.replace(/\.[^.]+$/, "") + ".jpg");
    execFileSync(
      ffmpegBin(),
      ["-y", "-i", srcPath, "-frames:v", "1", "-q:v", "2", tmpOut],
      { stdio: "ignore" },
    );
    return tmpOut;
  }
  return srcPath;
}

const ordered = [
  ...files.filter((f) => f.includes(FIRST)),
  ...files.filter((f) => !f.includes(FIRST)),
];

const results = [];
let idx = 0;
for (const file of ordered) {
  idx += 1;
  const outName = `${String(idx).padStart(2, "0")}.webp`;
  const outPath = path.join(OUT, outName);
  const input = resolveForSharp(file);

  await sharp(input)
    .rotate() // honour EXIF orientation (auto-orient)
    .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(outPath);

  const outMeta = await sharp(outPath).metadata();
  results.push({
    n: idx,
    src: file,
    out: outName,
    dims: `${outMeta.width}x${outMeta.height}`,
    kb: Math.round(fs.statSync(outPath).size / 1024),
  });
}

fs.rmSync(TMP, { recursive: true, force: true });

console.log("── login slideshow photos ──");
let total = 0;
for (const r of results) {
  total += r.kb;
  console.log(
    `${String(r.n).padStart(2, "0")}. ${r.out.padEnd(8)} ${r.dims.padEnd(10)} ${String(r.kb).padStart(4)} KB   ← ${r.src}`,
  );
}
console.log(`\n${results.length} photos · total ${(total / 1024).toFixed(2)} MB`);
console.log(`excluded (poster/kolase): ${EXCLUDE.join(", ")}`);
