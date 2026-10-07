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

/**
 * Strict allow-list for slide file names.
 *
 * A name is accepted only when it matches a conservative character set (no path
 * separators, no `..`, no null bytes, no leading dot), uses one of the whitelisted
 * image extensions, and is a single segment (not absolute, not nested).
 */
export function isSafeSlideName(name: string): boolean {
  if (typeof name !== "string" || name.length === 0 || name.length > 200) return false;
  // Reject control characters and anything outside the allow-list.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return false;
  if (name.includes("..")) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.startsWith(".")) return false;
  if (!SLIDE_EXT.includes(path.extname(name).toLowerCase())) return false;
  return true;
}

/**
 * Resolves a slide name to an absolute path **inside** SLIDES_DIR, or null when
 * the name is unsafe or would escape the directory. Callers must pass request
 * input through this rather than joining paths themselves.
 */
export function resolveSlidePath(name: string): string | null {
  if (!isSafeSlideName(name)) return null;
  const base = path.resolve(SLIDES_DIR);
  const resolved = path.resolve(base, name);
  // Final containment check: the parent must be exactly the slides directory.
  if (path.dirname(resolved) !== base) return null;
  return resolved;
}
