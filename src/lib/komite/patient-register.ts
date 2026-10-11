/**
 * Patient register — pure parsing/validation helpers.
 *
 * The register is uploaded by the Kepala Ruang of a room. We keep the parsing
 * logic pure & DB-free so it is unit-testable (header/row validation, RM dedup)
 * without touching a database. Real patient data must never be logged.
 *
 * Columns (owner requirement): No. | Nama Pasien | Nomor RM | Diagnosis.
 */

export interface RegisterRowInput {
  no?: number | string | null;
  patientName?: string | null;
  rmNumber?: string | null;
  diagnosis?: string | null;
}

export interface ParsedRegisterRow {
  no: number | null;
  patientName: string;
  rmNumber: string;
  diagnosis: string | null;
}

export interface RowError {
  /** 1-based data-row number (as presented to the user). */
  row: number;
  message: string;
}

export interface ParseResult {
  valid: ParsedRegisterRow[];
  errors: RowError[];
  /** RM numbers that appeared more than once within the upload. */
  duplicateRm: string[];
}

/** Accepted header aliases (case/space-insensitive). */
const HEADER_ALIASES: Record<keyof ParsedRegisterRow, string[]> = {
  no: ["no", "no.", "nomor", "nomor urut", "no urut"],
  patientName: ["nama pasien", "nama", "pasien", "patient name"],
  rmNumber: ["nomor rm", "no rm", "no. rm", "rm", "nomor rekam medis", "no rekam medis"],
  diagnosis: ["diagnosis", "dx", "diagnosa"],
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Maps a raw header row to column indices; throws a descriptive message on missing mandatory columns. */
export function mapRegisterHeaders(header: string[]): { no: number; patientName: number; rmNumber: number; diagnosis: number } {
  const find = (field: keyof ParsedRegisterRow): number => {
    const aliases = HEADER_ALIASES[field];
    return header.findIndex((h) => aliases.includes(normHeader(String(h ?? ""))));
  };
  const idx = {
    patientName: find("patientName"),
    rmNumber: find("rmNumber"),
    diagnosis: find("diagnosis"),
    no: find("no"),
  };
  const missing: string[] = [];
  if (idx.patientName < 0) missing.push("Nama Pasien");
  if (idx.rmNumber < 0) missing.push("Nomor RM");
  if (missing.length > 0) {
    throw new Error(`Kolom wajib tidak ditemukan: ${missing.join(", ")}`);
  }
  return idx;
}

/**
 * Validates rows against the header mapping. Rows that fail are reported in
 * `errors` and excluded from `valid` — the caller must NOT persist a partial
 * import when `errors.length > 0` (unless it explicitly chooses an all-or-nothing
 * apply after confirming).
 */
export function validateRegisterRows(rows: RegisterRowInput[], header: string[]): ParseResult {
  const idx = mapRegisterHeaders(header);
  const valid: ParsedRegisterRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  const duplicateRm = new Set<string>();

  rows.forEach((raw, i) => {
    const rowNo = i + 1;
    const patientName = String(raw.patientName ?? "").trim();
    const rmNumber = String(raw.rmNumber ?? "").trim();

    // Skip fully-empty rows silently (common in spreadsheets) — but count them as
    // not-an-error only when EVERY mapped cell is empty.
    if (!patientName && !rmNumber && !String(raw.diagnosis ?? "").trim()) return;

    if (!patientName) { errors.push({ row: rowNo, message: "Nama Pasien kosong" }); return; }
    if (!rmNumber) { errors.push({ row: rowNo, message: "Nomor RM kosong" }); return; }

    if (seen.has(rmNumber)) {
      duplicateRm.add(rmNumber);
      errors.push({ row: rowNo, message: `Nomor RM duplikat: ${rmNumber}` });
      return;
    }
    seen.set(rmNumber, rowNo);

    const noRaw = raw.no;
    const no = noRaw === null || noRaw === undefined || noRaw === "" ? null : Number(noRaw);
    valid.push({
      no: Number.isFinite(no as number) ? (no as number) : null,
      patientName,
      rmNumber,
      diagnosis: String(raw.diagnosis ?? "").trim() || null,
    });
  });

  void idx;
  return { valid, errors, duplicateRm: [...duplicateRm] };
}

/** Maximum rows accepted in one register upload (bounds CPU/memory). */
export const MAX_REGISTER_ROWS = 5000;
