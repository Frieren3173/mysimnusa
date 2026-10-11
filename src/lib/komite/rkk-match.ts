/**
 * RKK bulk-import matching engine (pure & DB-free).
 *
 * Matches RKK document files to registered staff. Priority:
 *   1. A unique identifier present in the filename (NIP — digits, exact).
 *   2. Normalised name (case/space/punctuation-insensitive).
 * Never guesses: ambiguous matches (≥2 candidates) are reported, not resolved.
 * Classification (PK 1 / PK 2) is intentionally NOT decided here — it must come
 * from the document CONTENTS once the owner provides the RKK files; until then
 * every matched file is flagged for review.
 */

export interface StaffCandidate {
  id: string;
  name: string;
  nip: string | null;
}

export type MatchStatus = "MATCHED" | "UNMATCHED" | "AMBIGUOUS";

export interface FileMatch {
  fileName: string;
  status: MatchStatus;
  staffId: string | null;
  staffName: string | null;
  /** How the match was made (diagnostics, no PII beyond name). */
  method: "NIP" | "NAME" | null;
  /** Number of candidates when ambiguous. */
  candidateCount: number;
}

/** Normalises a name: lowercase, collapse whitespace, strip titles/punctuation. */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[.,/\\_()\[\]{}'"-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extracts a plausible NIP: the longest digit run of length ≥ 8 in the string. */
export function extractNip(raw: string): string | null {
  const runs = raw.match(/\d{8,}/g);
  if (!runs) return null;
  return runs.sort((a, b) => b.length - a.length)[0];
}

/** Strips the file extension and separators to a searchable stem. */
export function fileStem(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, "");
}

/**
 * Matches a single filename against the staff list.
 * Deterministic and side-effect free.
 *
 * Name matching is token-based (words ≥3 letters, generic words like "rkk"/"scan"
 * dropped): a candidate requires an EXACT full-name match first; otherwise it
 * requires that ALL significant tokens of the candidate name appear in the stem
 * OR all significant stem tokens appear in the candidate name. This avoids the
 * false-positive of a bare first name ("Budi") while still catching partial
 * filenames ("RKK Dewi Lestari") — which correctly resolves to AMBIGUOUS when
 * two staff share those tokens.
 */
export function matchFile(fileName: string, staff: StaffCandidate[]): FileMatch {
  const stem = fileStem(fileName);

  // 1. NIP (exact, unique).
  const nip = extractNip(stem);
  if (nip) {
    const byNip = staff.filter((s) => s.nip === nip);
    if (byNip.length === 1) {
      return { fileName, status: "MATCHED", staffId: byNip[0].id, staffName: byNip[0].name, method: "NIP", candidateCount: 1 };
    }
    if (byNip.length > 1) {
      return { fileName, status: "AMBIGUOUS", staffId: null, staffName: null, method: "NIP", candidateCount: byNip.length };
    }
    // NIP present but not found → fall through to name matching as a secondary try.
  }

  const norm = normalizeName(stem);
  const fileTokens = significantTokens(norm);

  // 2a. Exact normalised name match wins deterministically.
  const exact = staff.filter((s) => normalizeName(s.name) === norm);
  if (exact.length === 1) {
    return { fileName, status: "MATCHED", staffId: exact[0].id, staffName: exact[0].name, method: "NAME", candidateCount: 1 };
  }
  if (exact.length > 1) {
    return { fileName, status: "AMBIGUOUS", staffId: null, staffName: null, method: "NAME", candidateCount: exact.length };
  }

  // 2b. Token containment (two-way) — needs ≥2 matching significant tokens.
  const nameMatches = staff.filter((s) => {
    const sTokens = significantTokens(normalizeName(s.name));
    if (sTokens.length === 0 || fileTokens.length === 0) return false;
    const allStaffInFile = sTokens.every((t) => fileTokens.includes(t));
    const allFileInStaff = fileTokens.every((t) => sTokens.includes(t));
    if (!allStaffInFile && !allFileInStaff) return false;
    const shared = sTokens.filter((t) => fileTokens.includes(t)).length;
    return shared >= 2;
  });
  if (nameMatches.length === 1) {
    return { fileName, status: "MATCHED", staffId: nameMatches[0].id, staffName: nameMatches[0].name, method: "NAME", candidateCount: 1 };
  }
  if (nameMatches.length > 1) {
    return { fileName, status: "AMBIGUOUS", staffId: null, staffName: null, method: "NAME", candidateCount: nameMatches.length };
  }

  return { fileName, status: "UNMATCHED", staffId: null, staffName: null, method: null, candidateCount: 0 };
}

/** Generic words that carry no identity and are ignored during token matching. */
const STOPWORDS = new Set(["rkk", "scan", "file", "dokumen", "doc", "pdf", "the", "dan"]);

/** Tokens of length ≥3 that are not stopwords. */
export function significantTokens(normalized: string): string[] {
  return normalized
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

export interface MatchReport {
  total: number;
  matched: FileMatch[];
  unmatched: FileMatch[];
  ambiguous: FileMatch[];
}

/** Runs `matchFile` over many files and groups the outcome. */
export function matchFiles(fileNames: string[], staff: StaffCandidate[]): MatchReport {
  const results = fileNames.map((f) => matchFile(f, staff));
  return {
    total: results.length,
    matched: results.filter((r) => r.status === "MATCHED"),
    unmatched: results.filter((r) => r.status === "UNMATCHED"),
    ambiguous: results.filter((r) => r.status === "AMBIGUOUS"),
  };
}

/** PK classification state. Filled only once the owner provides RKK contents. */
export type PkClass = "PK1" | "PK2" | "NEEDS_REVIEW";

/** Default classification before the owner's rules exist: always needs review. */
export function classifyPk(/* fileContent: unknown */): PkClass {
  return "NEEDS_REVIEW";
}
