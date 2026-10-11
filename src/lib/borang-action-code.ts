/**
 * Auto code generation for master tindakan (NursingAction).
 *
 * The code is owned by the SYSTEM — users only provide name/category/description.
 * Format: `<PREFIX>-<NNN>` where PREFIX is derived from the category and NNN is a
 * zero-padded sequence (e.g. `ASSESS-001`, `TINV-004`). Codes are deterministic
 * for a given (category, sequence), which lets the API retry safely on a unique
 * collision (P2002) by simply incrementing the sequence — no user input needed.
 *
 * Pure & DB-free so it can be unit-tested without a database.
 */

/** A short, stable, A–Z0–9 prefix derived from the category name. */
export function actionCodePrefix(category: string): string {
  const clean = category
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .toUpperCase();
  const words = clean.split(/\s+/).filter(Boolean);
  // First letter of each word (up to 6) — e.g. "Pemberian Obat" → "PO".
  if (words.length === 0) return "TIND";
  const initials = words.map((w) => w[0]).join("");
  // Prefer the initials; fall back to the first 6 chars of a single long word.
  const base = initials.length >= 2 ? initials : words[0];
  return base.slice(0, 6) || "TIND";
}

/** Builds `<PREFIX>-<NNN>` with the given 1-based sequence. */
export function buildActionCode(category: string, seq: number): string {
  const n = Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : 1;
  return `${actionCodePrefix(category)}-${String(n).padStart(3, "0")}`;
}

/**
 * Parses the trailing sequence out of an existing code for a category prefix.
 * Returns 0 when the code does not use this prefix/format.
 * e.g. ("PO-007", "Pemberian Obat") → 7
 */
export function parseActionSeq(code: string, category: string): number {
  const prefix = actionCodePrefix(category);
  const m = code.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}-(\\d+)$`));
  return m ? Number(m[1]) : 0;
}

/** Highest sequence among existing codes that share this category prefix. */
export function maxActionSeq(codes: string[], category: string): number {
  return codes.reduce((max, c) => {
    const n = parseActionSeq(c, category);
    return n > max ? n : max;
  }, 0);
}
