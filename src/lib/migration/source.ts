import * as XLSX from "xlsx";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────
// Vocabulary target field:
//   staff.<field>                       (name, nip, email, phone, address, dateOfBirth, profession, room, photoUrl)
//   education.level
//   document.<CODE>.file | .expiry | .expiryAlt | .number
//   competency.<CODE>
//   "" (ignored)
// ─────────────────────────────────────────────

export interface AutoMapResult {
  target: string;
  confidence: number;
}

/** Map a legacy spreadsheet header to a target field. */
export function autoMapColumn(rawHeader: string): AutoMapResult {
  const h = rawHeader
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const compact = h.replace(/[^a-z0-9]/g, "");

  // 1. Expiry columns first (they contain the doc name too)
  if (h.includes("masa berakhir")) {
    if (h.includes("jika seumur hidup")) {
      if (h.includes("str")) return { target: "document.STR.expiryAlt", confidence: 0.9 };
      if (h.includes("sip")) return { target: "document.SIP.expiryAlt", confidence: 0.9 };
      return { target: "", confidence: 0.5 };
    }
    if (h.includes("str")) return { target: "document.STR.expiry", confidence: 0.95 };
    if (h.includes("sip")) return { target: "document.SIP.expiry", confidence: 0.95 };
    if (h.includes("btcls")) return { target: "document.BTCLS.expiry", confidence: 0.95 };
    if (h.includes("ac ls") || h.includes("acls")) {
      return { target: "document.ACLS.expiry", confidence: 0.95 };
    }
    return { target: "", confidence: 0.3 };
  }

  // 2. Multi-word document lookalikes before generic contains()
  if (h.includes("verifikasi ijazah")) return { target: "document.IJAZAH_VERIFY.file", confidence: 0.95 };
  if (h.includes("rincian kewenangan")) return { target: "document.RKK_PREV.file", confidence: 0.95 };
  if (h.includes("rkk")) return { target: "document.RKK.file", confidence: 0.95 };
  if (h.includes("curiculum") || h.includes("curriculum") || compact === "cv") {
    return { target: "document.CV.file", confidence: 0.95 };
  }
  if (h.includes("ijazah")) return { target: "document.IJAZAH.file", confidence: 0.95 };
  if (h.includes("surat pengalaman")) return { target: "document.SURAT_PENGALAMAN.file", confidence: 0.95 };
  if (h.includes("foto")) return { target: "document.FOTO.file", confidence: 0.9 };

  // 3. Exact / short legalitas doc columns
  if (compact === "str") return { target: "document.STR.file", confidence: 1 };
  if (compact === "sip") return { target: "document.SIP.file", confidence: 1 };
  if (h.includes("btcls")) return { target: "document.BTCLS.file", confidence: 0.95 };
  if (h.includes("ac ls") || h.includes("acls")) return { target: "document.ACLS.file", confidence: 0.95 };

  // 4. Competencies
  if (h.includes("kardiologi") || /\(kd\)/.test(h)) return { target: "competency.KD", confidence: 0.95 };
  if (h.includes("resusitasi neonatus") || /\(rn\)/.test(h)) {
    return { target: "competency.RN", confidence: 0.95 };
  }
  if (h.includes("bedah")) return { target: "competency.BEDAH", confidence: 0.95 };
  if (h.includes("kompetensi icu") || compact === "icu") return { target: "competency.ICU", confidence: 0.95 };
  if (h.includes("picu")) return { target: "competency.PICU", confidence: 0.95 };
  if (h.includes("nicu")) return { target: "competency.NICU", confidence: 0.95 };
  if (h.includes("hemodialisa")) return { target: "competency.HEMODIALISA", confidence: 0.95 };
  if (h.includes("cathlab")) return { target: "competency.CATHLAB", confidence: 0.95 };
  if (h.includes("ppgdon")) return { target: "competency.PPGDON", confidence: 0.95 };
  if (h.includes("apn")) return { target: "competency.APN", confidence: 0.95 };
  if (h.includes("lainnya")) return { target: "competency.LAINNYA", confidence: 0.9 };

  // 5. Staff core fields
  if (h.includes("nip")) return { target: "staff.nip", confidence: 1 };
  if (h.includes("email")) return { target: "staff.email", confidence: 1 };
  if (h.includes("nama")) return { target: "staff.name", confidence: 1 };
  if (h.includes("ruangan")) return { target: "staff.room", confidence: 1 };
  if (h.includes("profesi")) return { target: "staff.profession", confidence: 1 };
  if (h.includes("tanggal lahir")) return { target: "staff.dateOfBirth", confidence: 1 };
  if (h.includes("handphone") || h.includes("nomor hp") || h.includes("nomor handphone")) {
    return { target: "staff.phone", confidence: 1 };
  }
  if (h.includes("alamat")) return { target: "staff.address", confidence: 1 };
  if (h.includes("pendidikan")) return { target: "education.level", confidence: 0.9 };

  // 6. Explicitly ignored legacy columns
  if (
    h.includes("timestamp") ||
    h.includes("gabungan") ||
    h.includes("status pengisian") ||
    h.includes("column")
  ) {
    return { target: "", confidence: 0.8 };
  }

  return { target: "", confidence: 0.2 };
}

export interface SheetScan {
  name: string;
  rowCount: number;
  headers: string[];
}

export interface ScanResult {
  fileName: string;
  sheets: SheetScan[];
  primarySheet: string;
  columns: { source: string; target: string; confidence: number }[];
  samples: Record<string, string>;
  totalRows: number;
  warnings: string[];
}

function isNonEmpty(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "";
}

/**
 * Parse guards — bound how much of an uploaded/exported workbook is read in one
 * scan so a malicious or accidental huge file cannot exhaust memory/CPU.
 */
export const MAX_SHEETS = 50;
export const MAX_ROWS_PER_SHEET = 20_000;
export const MAX_COLUMNS = 200;

function headerKey(h: string): string {
  return h.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Treat placeholder NIP values as missing.
 *
 * A string such as "-" contains no identifier and must not participate in NIP
 * deduplication. Callers fall back to email or name/profession instead.
 */
export function normalizeNip(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (!/[A-Za-z0-9]/.test(text)) return null;
  return text;
}

/** Read sheet rows as objects keyed by header (first row = header). */
export function readSheetObjects(
  filePath: string,
  sheetName: string
): Record<string, unknown>[] {
  const wb = readWorkbook(filePath);
  return readSheetObjectsFromWorkbook(wb, sheetName).slice(0, MAX_ROWS_PER_SHEET);
}

/** Read rows from an already-loaded workbook. Exported for unit tests. */
export function readSheetObjectsFromWorkbook(
  wb: XLSX.WorkBook,
  sheetName: string
): Record<string, unknown>[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  resolveSheetHyperlinks(ws, wb);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
}

/**
 * Replace cached display text with the URL inside supported HYPERLINK formulas.
 *
 * Google Sheets exports alias text such as “Buka Foto” while retaining the source
 * formula. The migration importer needs the underlying link, not the label.
 * Only references inside the uploaded workbook are followed; no code is executed.
 */
export function resolveSheetHyperlinks(ws: XLSX.WorkSheet, wb: XLSX.WorkBook): void {
  for (const [address, cell] of Object.entries(ws)) {
    if (address.startsWith("!")) continue;
    const formula = typeof cell === "object" && cell !== null && "f" in cell ? String((cell as { f?: unknown }).f ?? "") : "";
    const value = typeof cell === "object" && cell !== null && "v" in cell ? (cell as { v?: unknown }).v : null;
    if (!formula || value === null || value === undefined || value === "") continue;
    if (/^https?:\/\//i.test(String(value))) continue;
    const target = resolveHyperlinkTarget(formula, wb, ws, address, new Set());
    if (target && isHttpUrl(target)) {
      (cell as XLSX.CellObject).v = target;
      (cell as XLSX.CellObject).w = target;
      (cell as XLSX.CellObject).t = "s";
    }
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function splitFormulaArguments(input: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let single = false;
  let double = false;
  let current = "";
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (single) {
      current += char;
      if (char === "'") {
        if (input[i + 1] === "'") {
          current += input[++i];
        } else {
          single = false;
        }
      }
      continue;
    }
    if (double) {
      current += char;
      if (char === '"') {
        if (input[i + 1] === '"') {
          current += input[++i];
        } else {
          double = false;
        }
      }
      continue;
    }
    if (char === "'") {
      single = true;
      current += char;
    } else if (char === '"') {
      double = true;
      current += char;
    } else if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      args.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  args.push(current);
  return args;
}

function unquoteFormulaString(value: string): string {
  const text = value.trim();
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/""/g, '"');
  }
  return text;
}

function parseWorkbookCellReference(
  wb: XLSX.WorkBook,
  currentSheet: string,
  reference: string
): { sheet: string; address: string } | null {
  const match = /^(?:'((?:[^']|'')+)'|([A-Za-z0-9_]+))?!?\$?([A-Z]+)\$?(\d+)$/i.exec(reference.trim());
  if (!match) return null;
  const sheet = (match[1] ?? match[2] ?? currentSheet).replace(/''/g, "'");
  const sheetNames = new Map(wb.SheetNames.map((name) => [name.toLowerCase(), name]));
  const actualSheet = sheetNames.get(sheet.toLowerCase()) ?? currentSheet;
  try {
    const decoded = XLSX.utils.decode_cell(`${match[3]!.toUpperCase()}${match[4]}`);
    return { sheet: actualSheet, address: XLSX.utils.encode_cell(decoded) };
  } catch {
    return null;
  }
}

function cellStringValue(
  wb: XLSX.WorkBook,
  sheet: string,
  address: string,
  seen: Set<string>
): string | null {
  const ws = wb.Sheets[sheet];
  const cell = ws?.[address] as XLSX.CellObject | undefined;
  if (!cell || cell.v === null || cell.v === undefined) return null;
  if (typeof cell.f === "string" && cell.f && !/^https?:\/\//i.test(String(cell.v))) {
    const key = `${sheet}!${address}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const resolved = resolveHyperlinkTarget(cell.f, wb, ws!, address, seen);
    if (resolved && isHttpUrl(resolved)) return resolved;
  }
  return String(cell.v);
}

function matchLookupValue(
  lookupExpression: string,
  rangeExpression: string,
  wb: XLSX.WorkBook,
  currentSheet: string,
  currentAddress: string,
  seen: Set<string>
): number | null {
  const rangeMatch = /^(?:'((?:[^']|'')+)'|([A-Za-z0-9_]+))?!?\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(rangeExpression.trim());
  if (!rangeMatch) return null;
  const sheetName = ((rangeMatch[1] ?? rangeMatch[2] ?? currentSheet).replace(/''/g, "'"));
  const sheetNames = new Map(wb.SheetNames.map((name) => [name.toLowerCase(), name]));
  const actualSheet = sheetNames.get(sheetName.toLowerCase()) ?? currentSheet;
  const start = XLSX.utils.decode_cell(`${rangeMatch[3]!.toUpperCase()}${rangeMatch[4]}`);
  const end = XLSX.utils.decode_cell(`${rangeMatch[5]!.toUpperCase()}${rangeMatch[6]}`);
  const wanted = lookupValue(lookupExpression, wb, currentSheet, currentAddress, seen);
  if (wanted === null) return null;
  const target = wanted.trim().toLowerCase();
  if (!target) return null;

  for (let row = start.r; row <= end.r; row++) {
    for (let col = start.c; col <= end.c; col++) {
      const candidate = cellStringValue(wb, actualSheet, XLSX.utils.encode_cell({ r: row, c: col }), seen);
      if (candidate !== null && candidate.trim().toLowerCase() === target) {
        return row - start.r + 1;
      }
    }
  }
  return null;
}

function lookupValue(
  expression: string,
  wb: XLSX.WorkBook,
  currentSheet: string,
  currentAddress: string,
  seen: Set<string>
): string | null {
  const text = expression.trim();
  if (!text) return null;
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return unquoteFormulaString(text);
  }
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return text;
  const reference = parseWorkbookCellReference(wb, currentSheet, text);
  if (reference) {
    return cellStringValue(wb, reference.sheet, reference.address, seen);
  }
  return null;
}

function resolveIntegerExpression(
  expression: string,
  wb: XLSX.WorkBook,
  currentSheet: string,
  seen: Set<string>
): number | null {
  const text = expression.trim();
  if (/^MATCH\s*\(/i.test(text)) {
    return resolveMatchValue(text, wb, currentSheet, "", seen);
  }
  const value = lookupValue(text, wb, currentSheet, "", seen);
  if (value !== null && /^[+-]?\d+$/.test(value.trim())) return Number(value);
  return null;
}

function resolveIndexValue(
  expression: string,
  wb: XLSX.WorkBook,
  currentSheet: string,
  seen: Set<string>
): string | null {
  const match = /^INDEX\s*\(([\s\S]*)\)$/i.exec(expression.trim());
  if (!match) return null;
  const args = splitFormulaArguments(match[1] ?? "");
  if (args.length < 2) return null;
  const rangeMatch = /^(?:'((?:[^']|'')+)'|([A-Za-z0-9_]+))?!?\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(args[0]!.trim());
  if (!rangeMatch) return null;
  const sheetName = (rangeMatch[1] ?? rangeMatch[2] ?? currentSheet).replace(/''/g, "'");
  const sheetNames = new Map(wb.SheetNames.map((name) => [name.toLowerCase(), name]));
  const actualSheet = sheetNames.get(sheetName.toLowerCase()) ?? currentSheet;
  const start = XLSX.utils.decode_cell(`${rangeMatch[3]!.toUpperCase()}${rangeMatch[4]}`);
  const end = XLSX.utils.decode_cell(`${rangeMatch[5]!.toUpperCase()}${rangeMatch[6]}`);
  const rowNumber = resolveIntegerExpression(args[1]!.trim(), wb, currentSheet, seen);
  if (rowNumber === null || rowNumber < 1) return null;
  const row = start.r + rowNumber - 1;
  if (row > end.r) return null;
  const column = args[2] !== undefined
    ? (resolveIntegerExpression(args[2].trim(), wb, currentSheet, seen) ?? 1)
    : 1;
  const resolvedColumn = start.c + column - 1;
  if (resolvedColumn < start.c || resolvedColumn > end.c) return null;
  return cellStringValue(wb, actualSheet, XLSX.utils.encode_cell({ r: row, c: resolvedColumn }), seen);
}

function resolveMatchValue(
  expression: string,
  wb: XLSX.WorkBook,
  currentSheet: string,
  currentAddress: string,
  seen: Set<string>
): number | null {
  const match = /^MATCH\s*\(([\s\S]*)\)$/i.exec(expression.trim());
  if (!match) return null;
  const args = splitFormulaArguments(match[1] ?? "");
  if (args.length < 2) return null;
  return matchLookupValue(args[0]!.trim(), args[1]!.trim(), wb, currentSheet, currentAddress, seen);
}

function resolveHyperlinkTarget(
  formula: string,
  wb: XLSX.WorkBook,
  currentSheet: XLSX.WorkSheet,
  currentAddress: string,
  seen: Set<string>
): string | null {
  const sheetName = wb.SheetNames.find((name) => wb.Sheets[name] === currentSheet) ?? "";
  const text = formula.trim();
  const ifError = /^IFERROR\s*\(([\s\S]*)\)$/i.exec(text);
  if (ifError) {
    for (const branch of splitFormulaArguments(ifError[1] ?? "")) {
      const resolved = resolveHyperlinkTarget(branch, wb, currentSheet, currentAddress, seen);
      if (resolved && isHttpUrl(resolved)) return resolved;
    }
    return null;
  }

  const hyperlink = /^HYPERLINK\s*\(([\s\S]*)\)$/i.exec(text);
  if (hyperlink) {
    const args = splitFormulaArguments(hyperlink[1] ?? "");
    if (args.length === 0) return null;
    const index = resolveIndexValue(args[0]!.trim(), wb, sheetName, seen);
    if (index && isHttpUrl(index)) return index;
    const nested = resolveHyperlinkTarget(args[0]!.trim(), wb, currentSheet, currentAddress, seen);
    if (nested && isHttpUrl(nested)) return nested;
    const literal = unquoteFormulaString(args[0]!.trim());
    return isHttpUrl(literal) ? literal : null;
  }

  if (/^INDEX\s*\(/i.test(text)) {
    const resolved = resolveIndexValue(text, wb, sheetName, seen);
    return resolved && isHttpUrl(resolved) ? resolved : null;
  }

  if (/^MATCH\s*\(/i.test(text)) {
    const position = resolveMatchValue(text, wb, sheetName, currentAddress, seen);
    return position !== null ? String(position) : null;
  }

  const reference = parseWorkbookCellReference(wb, sheetName, text);
  if (reference) {
    const value = cellStringValue(wb, reference.sheet, reference.address, seen);
    return value && isHttpUrl(value) ? value : null;
  }

  const literal = unquoteFormulaString(text);
  return isHttpUrl(literal) ? literal : null;
}

function readWorkbook(filePath: string, attempts = 4): XLSX.WorkBook {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      // Read bytes ourselves: XLSX.readFile's fs shim is unreliable inside
      // the Next.js route bundle (freshly written files on Windows).
      const buf = fs.readFileSync(filePath);
      return XLSX.read(buf, { type: "buffer", cellDates: true, cellFormula: true });
    } catch (e) {
      lastErr = e;
      const end = Date.now() + 150 * (i + 1);
      while (Date.now() < end) { /* sync backoff */ }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Cannot access file ${filePath}`);
}

/** Full read-only scan of an uploaded XLSX file. */
export function scanXlsxFile(filePath: string, fileName: string): ScanResult {
  const wb = readWorkbook(filePath);
  const warnings: string[] = [];
  const sheets: SheetScan[] = [];

  const sheetNames = wb.SheetNames.slice(0, MAX_SHEETS);
  if (wb.SheetNames.length > MAX_SHEETS) {
    warnings.push(`Hanya ${MAX_SHEETS} sheet pertama yang dipindai (total ${wb.SheetNames.length}).`);
  }

  for (const name of sheetNames) {
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], {
      defval: null,
    });
    if (rawRows.length > MAX_ROWS_PER_SHEET) {
      warnings.push(
        `Sheet "${name}" dibatasi ${MAX_ROWS_PER_SHEET} baris (total ${rawRows.length}).`,
      );
    }
    const rows = rawRows.slice(0, MAX_ROWS_PER_SHEET);
    const filled = rows.filter((r) => Object.values(r).some(isNonEmpty));
    const headers = rows.length > 0 ? Object.keys(rows[0]).slice(0, MAX_COLUMNS) : [];
    sheets.push({ name, rowCount: filled.length, headers });
  }

  // Primary sheet = one with most columns & rows containing "nama" header
  let primary = sheets[0]?.name ?? "";
  let bestScore = -1;
  for (const s of sheets) {
    const hasNama = s.headers.some((h) => headerKey(h).includes("nama"));
    const hasNip = s.headers.some((h) => headerKey(h).includes("nip"));
    const score = s.headers.length + s.rowCount * 0.01 + (hasNama ? 50 : 0) + (hasNip ? 20 : 0);
    if (score > bestScore) {
      bestScore = score;
      primary = s.name;
    }
  }

  const primarySheet = sheets.find((s) => s.name === primary);
  const headers = primarySheet?.headers ?? [];

  const columns = headers.map((h) => {
    const m = autoMapColumn(h);
    return { source: h, target: m.target, confidence: m.confidence };
  });

  const unmapped = columns.filter((c) => c.target === "" && c.confidence < 0.5);
  if (unmapped.length > 0) {
    warnings.push(`${unmapped.length} kolom tidak dikenali: ${unmapped.map((c) => c.source).join(", ")}`);
  }

  // Sample values from first data row of primary sheet
  const samples: Record<string, string> = {};
  const rows = readSheetObjects(filePath, primary);
  const firstRow = rows.find((r) => Object.values(r).some(isNonEmpty));
  if (firstRow) {
    for (const h of headers) {
      const v = firstRow[h];
      samples[h] = v === null || v === undefined ? "" : String(v).slice(0, 80);
    }
  }

  return {
    fileName,
    sheets,
    primarySheet: primary,
    columns,
    samples,
    totalRows: primarySheet?.rowCount ?? 0,
    warnings,
  };
}

// ─── Value parsing helpers ─────────────────────

export function parseExpiryValue(v: unknown): { date: Date | null; lifetime: boolean } {
  if (v === null || v === undefined || v === "") return { date: null, lifetime: false };
  if (v instanceof Date) return { date: v, lifetime: false };
  const s = String(v).trim();
  if (/seumur hidup/i.test(s)) return { date: null, lifetime: true };
  if (/^(\d{4})-(\d{2})-(\d{2})/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return { date: d, lifetime: false };
  }
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(d.getTime())) return { date: d, lifetime: false };
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
    return { date: parsed, lifetime: false };
  }
  return { date: null, lifetime: false };
}

export function parseDateValue(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function isDriveUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  return /drive\.google\.com|docs\.google\.com/i.test(v);
}

/**
 * Extracts a Google spreadsheet ID from a URL, but ONLY when the URL is hosted
 * on an allow-listed Google domain. This prevents an attacker-supplied URL to an
 * arbitrary host from being accepted as a "Google Sheet" source (SSRF/drive-by).
 * Returns null when the host is not allowed or no ID is present.
 */
const GOOGLE_SHEET_HOSTS = new Set([
  "docs.google.com",
  "drive.google.com",
  "sheets.google.com",
  "spreadsheets.google.com",
]);

export function extractSheetIdFromUrl(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  // Bare spreadsheet ID (no scheme/host).
  if (/^[a-zA-Z0-9-_]{20,}$/.test(value)) return value;

  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!GOOGLE_SHEET_HOSTS.has(host)) return null;

  const m = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

export function extractDriveId(url: string): string | null {
  const m =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    url.match(/open\?id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/**
 * Native Google Workspace MIME types and the export format used for downloads.
 * A Drive UI URL alone does not prove this: a `/document/d/…` link can point to
 * an uploaded Word file, which must be downloaded with `alt=media` rather than
 * the native-Docs export endpoint.
 */
export const GOOGLE_NATIVE_EXPORT_MIME: Record<string, string> = {
  "application/vnd.google-apps.document":
    "application/pdf",
  "application/vnd.google-apps.spreadsheet":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.google-apps.presentation":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.google-apps.drawing": "image/png",
};

/** Builds a Drive download URL, exporting only genuine native Workspace files. */
export function driveDownloadUrl(fileId: string, mimeType?: string | null): string {
  const encoded = encodeURIComponent(fileId);
  const exportMime = mimeType ? GOOGLE_NATIVE_EXPORT_MIME[mimeType] : undefined;
  if (exportMime) {
    return `https://www.googleapis.com/drive/v3/files/${encoded}/export?mimeType=${encodeURIComponent(exportMime)}`;
  }
  return `https://www.googleapis.com/drive/v3/files/${encoded}?alt=media&supportsAllDrives=true`;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,.'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rowHash(row: Record<string, unknown>): string {
  const stable = JSON.stringify(row, (_k, v) =>
    v instanceof Date ? v.toISOString() : v
  );
  return createHash("sha1").update(stable).digest("hex").slice(0, 32);
}

// ─── Storage paths ─────────────────────────────

export const STORAGE_ROOT = path.join(process.cwd(), "storage");

export function migrationFilePath(batchId: string): string {
  return path.join(STORAGE_ROOT, "migration", `${batchId}.xlsx`);
}

export function ensureStorage(): void {
  fs.mkdirSync(path.join(STORAGE_ROOT, "migration"), { recursive: true });
  fs.mkdirSync(path.join(STORAGE_ROOT, "documents"), { recursive: true });
}
