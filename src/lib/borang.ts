export type BorangAction = "SUBMIT" | "VERIFY" | "APPROVE" | "REJECT" | "ARCHIVE";

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

/** No. rekam medis random 6 digit, unik terhadap `taken`. */
export function generateRmNumber(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 0; i < 100; i++) {
    const n = String(Math.floor(100000 + Math.random() * 900000));
    if (!used.has(n)) return n;
  }
  return String(Date.now()).slice(-6);
}

// ─────────────────────────────────────────────────────────────
// PATIENT ROW EXPANSION (derive-at-display)
//
// A single BorangEntry stores one action with a `quantity`. For output
// (patient list in the UI and the generated DOCX), each entry is expanded into
// `quantity` anonymised patient rows — one initial per patient, each with a
// unique medical-record (No. RM) number, unique across the whole document.
//
// Nothing is persisted here: this is a pure, deterministic transform over the
// existing entries, so the database schema and all master data stay unchanged.
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
  /** Unique medical-record number within the document. */
  rmNumber: string;
  actionType: string;
  /** The action quantity this row was expanded from. */
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
 * Expand entries into `quantity` patient rows each.
 *
 * - Patient initials increment from each entry's stored base code.
 * - No. RM numbers are made unique across the entire document. When the stored
 *   number is numeric it is offset; non-numeric/absent values fall back to a
 *   deterministic sequence from a base value.
 */
export function expandPatientRows(entries: PatientEntryInput[]): PatientRow[] {
  const rows: PatientRow[] = [];
  const usedRm = new Set<string>();
  let counter = 0;

  const nextFallbackRm = (): string => {
    counter += 1;
    // Deterministic 6-digit base; uniqueness is enforced by the usedRm loop.
    let n = 100000 + (counter * 7919) % 900000;
    let s = String(n);
    while (usedRm.has(s)) {
      n = 100000 + ((n + 1) % 900000);
      s = String(n);
    }
    return s;
  };

  for (const entry of entries) {
    const qty = Math.max(1, Math.min(999, Math.floor(entry.quantity) || 1));
    const { prefix, letter } = splitPatientCode(entry.patientIdentifier);

    const baseRmNumeric =
      entry.rmNumber && /^\d+$/.test(entry.rmNumber) ? Number(entry.rmNumber) : null;

    for (let i = 0; i < qty; i++) {
      const name = patientCodeAt(prefix, letter, i);

      let rm: string;
      if (baseRmNumeric !== null) {
        let candidate = baseRmNumeric + i;
        let s = String(candidate);
        // Keep it a sane 6-digit shape while assuring no duplicate in the doc.
        while (usedRm.has(s)) {
          candidate += 1;
          s = String(candidate);
        }
        rm = s;
      } else {
        rm = nextFallbackRm();
      }

      usedRm.add(rm);
      rows.push({
        no: rows.length + 1,
        name,
        rmNumber: rm,
        actionType: entry.actionType,
        quantity: qty,
      });
    }
  }

  return rows;
}

export const BORANG_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draf",
  SUBMITTED: "Terkirim",
  VERIFICATION: "Verifikasi",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  ARCHIVED: "Diarsipkan",
};

export const BORANG_STATUS_VARIANT: Record<
  string,
  "default" | "draft" | "pending" | "info" | "active" | "rejected" | "archived"
> = {
  DRAFT: "draft",
  SUBMITTED: "pending",
  VERIFICATION: "info",
  APPROVED: "active",
  REJECTED: "rejected",
  ARCHIVED: "archived",
};

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
