/**
 * Spreadsheet formula-injection defence.
 *
 * When untrusted text (e.g. a staff name or a free-text action) is written into
 * a CSV/XLSX cell, a value beginning with `=`, `+`, `-`, `@`, a tab or a CR can
 * be interpreted as a formula by Excel / Sheets (CSV injection / "DDE" attacks).
 *
 * `neutralizeSpreadsheetCell` prefixes such values with a single quote so they
 * are treated as literal text. Pure numbers and ISO dates are left untouched so
 * legitimate numeric/date columns keep working.
 */

/** Characters that trigger formula interpretation in common spreadsheet apps. */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/** True when the string looks like a pure number (optionally signed / decimal). */
export function isNumericLiteral(value: string): boolean {
  return /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value);
}

/** True when the string is an ISO-ish date (YYYY-MM-DD or with time). */
export function isDateLiteral(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/.test(value);
}

/**
 * Returns a cell value that is safe to write to a spreadsheet. Numeric and date
 * literals are returned unchanged; strings that begin with a formula trigger are
 * prefixed with a single quote.
 */
export function neutralizeSpreadsheetCell(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;

  const s = String(value);
  if (s === "") return s;
  if (isNumericLiteral(s) || isDateLiteral(s)) return s;

  if (FORMULA_TRIGGERS.some((t) => s.startsWith(t))) {
    return `'${s}`;
  }
  return s;
}

/** Neutralizes every string cell in a (header-less) row. */
export function neutralizeSpreadsheetRow<T extends Record<string, unknown>>(
  row: T,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = neutralizeSpreadsheetCell(value);
  }
  return out;
}
