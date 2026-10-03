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

function headerKey(h: string): string {
  return h.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Read sheet rows as objects keyed by header (first row = header). */
export function readSheetObjects(
  filePath: string,
  sheetName: string
): Record<string, unknown>[] {
  const wb = readWorkbook(filePath);
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
}

function readWorkbook(filePath: string, attempts = 4): XLSX.WorkBook {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      // Read bytes ourselves: XLSX.readFile's fs shim is unreliable inside
      // the Next.js route bundle (freshly written files on Windows).
      const buf = fs.readFileSync(filePath);
      return XLSX.read(buf, { type: "buffer", cellDates: true });
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

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], {
      defval: null,
    });
    const filled = rows.filter((r) => Object.values(r).some(isNonEmpty));
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
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

export function extractDriveId(url: string): string | null {
  const m =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    url.match(/open\?id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
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
