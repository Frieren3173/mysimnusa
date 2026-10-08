export type BorangAction = "SUBMIT" | "VERIFY" | "APPROVE" | "REJECT" | "ARCHIVE";

// Status labels/variants now live in `borang-workflow.ts` (single source of
// truth, extended for the Kepala Ruang workflow). Re-exported here so existing
// imports from `@/lib/borang` keep working unchanged.
export {
  BORANG_STATUS_LABEL,
  BORANG_STATUS_VARIANT,
} from "./borang-workflow";

export const PATIENT_CODE_RE = /^(TN|NY|BY\.(TN|NY))\.[A-Z]{1,2}$/;

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function shuffle(list: string[]): string[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Kode pasien anonim sesuai ruangan: PONEK = Ny.X, Perinatologi = By.TN/Ny.X, umum = Tn.X/Ny.X. */
export function generatePatientCode(roomName: string | null, taken: Iterable<string>): string {
  const room = (roomName ?? "").toLowerCase();
  const prefixes =
    room.includes("perina") || room.includes("nicu")
      ? ["BY.TN", "BY.NY"]
      : room.includes("ponek")
        ? ["NY"]
        : ["TN", "NY"];
  const used = new Set(taken);
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const single = shuffle(ALPHA.split("")).find((l) => !used.has(`${prefix}.${l}`));
  if (single) return `${prefix}.${single}`;
  for (let i = 0; i < 500; i++) {
    const two = ALPHA[Math.floor(Math.random() * 26)] + ALPHA[Math.floor(Math.random() * 26)];
    if (!used.has(`${prefix}.${two}`)) return `${prefix}.${two}`;
  }
  return `${prefix}.${Date.now().toString(36).toUpperCase().slice(-2)}`;
}

/**
 * No. rekam medis: tepat 6 digit angka (000001–999999), random, non-sequential,
 * tidak pernah `000000`, dan unik terhadap `taken`.
 *
 * Leading zeros are preserved (e.g. `004821`) by zero-padding to 6 digits.
 */
export function generateRmNumber(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 0; i < 500; i++) {
    const n = Math.floor(1 + Math.random() * 999999); // 1..999999
    const s = String(n).padStart(6, "0");
    if (s !== "000000" && !used.has(s)) return s;
  }
  // Exhausted the random attempts (extremely unlikely) — walk deterministically.
  for (let n = 1; n <= 999999; n++) {
    const s = String(n).padStart(6, "0");
    if (!used.has(s)) return s;
  }
  return "000001";
}

// ─────────────────────────────────────────────────────────────
// PATIENT ROW EXPANSION (derive-at-display)
//
// A single BorangEntry stores one action with a `quantity`. For output
// (patient list in the UI, the generated DOCX, and the preview modal), each
// entry is expanded into `quantity` anonymised patient rows:
//
//   • one patient initial per row (unique within the entry),
//   • each row has JUMLAH = 1 (the row *is* one patient),
//   • each row has a unique 6-digit No. RM within the whole document.
//
// The RM is a deterministic scramble of (initial, action, index): it looks
// random and non-sequential, is never 000000, and — crucially — is stable, so
// the on-screen list, the preview modal and the printed DOCX always show the
// same numbers for the same entry. Nothing is persisted; the database schema
// and all master data stay unchanged.
// ─────────────────────────────────────────────────────────────

const EXPAND_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface PatientEntryInput {
  period: string;
  patientIdentifier: string;
  rmNumber: string | null;
  actionType: string;
  quantity: number;
}

export interface PatientRow {
  /** Sequential number within the document (1-based). */
  no: number;
  /** Anonymised patient initial, e.g. TN.A / NY.B / BY.NY.C. */
  name: string;
  /** Unique 6-digit medical-record number within the document. */
  rmNumber: string;
  actionType: string;
  /** Always 1 — each row represents exactly one patient. */
  quantity: number;
}

/** Split a patient code into its prefix and current letter(s). */
function splitPatientCode(code: string): { prefix: string; letter: string } {
  const dot = code.lastIndexOf(".");
  if (dot === -1) return { prefix: "TN", letter: "A" };
  return { prefix: code.slice(0, dot), letter: code.slice(dot + 1) };
}

/** Nth anonymised code within an entry: A, B, … Z, AA, AB, … */
function patientCodeAt(prefix: string, letter: string, index: number): string {
  const base = EXPAND_ALPHA.indexOf((letter || "A").charAt(0));
  const start = base >= 0 ? base : 0;
  const pos = start + index;
  let label: string;
  if (pos < 26) {
    label = EXPAND_ALPHA[pos];
  } else {
    const a = Math.floor(pos / 26) - 1;
    const b = pos % 26;
    label = EXPAND_ALPHA[Math.max(0, a)] + EXPAND_ALPHA[b];
  }
  return `${prefix}.${label}`;
}

/**
 * FNV-1a style string hash → 32-bit unsigned int. Cheap, stable, well-spread —
 * good enough to turn a patient key into a random-looking record number.
 */
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic 6-digit No. RM (000001–999999, never 000000) for a patient,
 * unique against `used`. The `salt` lets the caller retry with a different
 * value when a collision occurs.
 */
function scrambledRm(key: string, used: Set<string>): string {
  for (let salt = 0; salt < 1000; salt++) {
    const n = 1 + (hashString(`${key}#${salt}`) % 999999); // 1..999999
    const s = String(n).padStart(6, "0");
    if (s !== "000000" && !used.has(s)) return s;
  }
  // Practically unreachable fallback.
  for (let n = 1; n <= 999999; n++) {
    const s = String(n).padStart(6, "0");
    if (!used.has(s)) return s;
  }
  return "000001";
}

/**
 * Expand entries into `quantity` patient rows each.
 *
 * - Patient initials increment from each entry's stored base code.
 * - Every row is a single patient (JUMLAH = 1).
 * - No. RM is a unique, non-sequential, random-looking 6-digit number across
 *   the whole document, and stable across renders (UI ⇄ modal ⇄ DOCX).
 */
export function expandPatientRows(entries: PatientEntryInput[]): PatientRow[] {
  const rows: PatientRow[] = [];
  const usedRm = new Set<string>();

  for (const entry of entries) {
    const qty = Math.max(1, Math.min(999, Math.floor(entry.quantity) || 1));
    const { prefix, letter } = splitPatientCode(entry.patientIdentifier);

    for (let i = 0; i < qty; i++) {
      const name = patientCodeAt(prefix, letter, i);
      const rn = scrambledRm(`${entry.patientIdentifier}|${entry.actionType}|${i}`, usedRm);
      usedRm.add(rn);
      rows.push({
        no: rows.length + 1,
        name,
        rmNumber: rn,
        actionType: entry.actionType,
        quantity: 1,
      });
    }
  }

  return rows;
}

export const ACTION_LABEL: Record<BorangAction, string> = {
  SUBMIT: "Kirim",
  VERIFY: "Verifikasi",
  APPROVE: "Setujui",
  REJECT: "Tolak",
  ARCHIVE: "Arsipkan",
};

// ─────────────────────────────────────────────────────────────
// SIGNATURE BLOCK (3 columns: Kasi → Kepala Ruangan → Perawat)
// ─────────────────────────────────────────────────────────────

/** Fixed signatory — Kepala Seksi Keperawatan dan Kebidanan. */
export const KASI_KEPERAWATAN = {
  position: "KEPALA SEKSI KEPERAWATAN DAN KEBIDANAN",
  name: "Muhammad Rijali Pajri, S.Kep.Ners., M.M",
  nip: "198607212009121001",
} as const;

/** Blank position (to be filled by hand on the printed document). */
export const KEPALA_RUANGAN = {
  position: "KEPALA RUANGAN",
  name: "",
  nip: "",
} as const;

/** The requesting nurse — filled automatically from the entry's staff. */
export const PERAWAT_PEMOHON_POSITION = "PERAWAT YANG MEMINTA";
