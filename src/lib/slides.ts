import * as fs from "fs";
import * as path from "path";

export const SLIDES_DIR = path.join(process.cwd(), "public", "uploads", "slides");

const SLIDE_EXT = [".jpg", ".jpeg", ".png", ".webp"];

/** Safe public path for a slide file. */
export function slideSrc(name: string): string {
  return `/uploads/slides/${encodeURIComponent(name)}`;
}

/** List slide filenames (images only), sorted ascending. Never throws. */
export function listSlides(): string[] {
  try {
    return fs
      .readdirSync(SLIDES_DIR)
      .filter((f) => SLIDE_EXT.includes(path.extname(f).toLowerCase()))
      .sort();
  } catch {
    return [];
  }
}

/** Validate a slide filename: no traversal, must be a slide image. */
export function isSafeSlideName(name: string): boolean {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return false;
  if (!SLIDE_EXT.includes(path.extname(name).toLowerCase())) return false;
  const resolved = path.resolve(SLIDES_DIR, name);
  return path.dirname(resolved) === path.resolve(SLIDES_DIR);
}
