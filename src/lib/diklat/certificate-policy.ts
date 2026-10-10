/**
 * Diklat/IHT certificate eligibility policy.
 *
 * Pure, DB-free decision logic — the single source of truth for "may this
 * participant receive a certificate?". Kept testable so the server, the batch
 * processor and the unit tests all share one definition (no UI/API drift).
 *
 * Three modes (stored per activity on `Training.certificateMode`):
 *
 *   ATTENDANCE_ONLY  (Mode A) — attendance alone qualifies.
 *   TEST_SCORED      (Mode B) — a test must be completed; optionally a minimum
 *                               score is required.
 *   TEST_COMPLETION  (Mode C) — a test must be completed; any score qualifies
 *                               unless a minimum score is enabled.
 *
 * Mode B and C differ only in intent; the rules below cover both and the mode
 * is preserved verbatim so the UI can present the right wording.
 *
 * ATTENDANCE IS BINARY: in every mode, ≥1 valid HADIR is required and means the
 * participant attended the whole activity. There is NO percentage gate (the
 * legacy `minAttendanceRate` field is retained for data compatibility only and
 * is ignored).
 */

export const CERTIFICATE_MODES = ["ATTENDANCE_ONLY", "TEST_SCORED", "TEST_COMPLETION"] as const;
export type CertificateMode = (typeof CERTIFICATE_MODES)[number];

export function isCertificateMode(v: unknown): v is CertificateMode {
  return typeof v === "string" && (CERTIFICATE_MODES as readonly string[]).includes(v);
}

/** Attendance statuses that count toward "present" (SAKIT/IZIN do NOT). */
export const PRESENT_ATTENDANCE_STATUSES = ["HADIR"] as const;

/** The stored policy for an activity. */
export interface CertificatePolicy {
  mode: CertificateMode;
  requireTest: boolean;
  requireMinScore: boolean;
  minScore: number | null;
  showScore: boolean;
  /**
   * @deprecated LEGACY percentage gate — NO LONGER USED. Attendance is binary
   * (≥1 HADIR = attended the whole activity), so there is no percentage
   * threshold for eligibility or JPL. The column/value is retained only for
   * backward data & config compatibility and is ignored by `evaluateEligibility`.
   */
  minAttendanceRate: number | null;
}

/**
 * The participant-facing snapshot used to decide eligibility. Everything is
 * pre-resolved by the caller from the DB so this function stays pure.
 */
export interface ParticipantProgress {
  /**
   * @deprecated NOT USED by `evaluateEligibility` and always populated with `0`
   * by the issuance service. Attendance is binary, so no "participant count"
   * denominator exists. Kept only to avoid churn in existing callers/tests.
   */
  participantCount: number;
  /** How many attendance records exist for THIS participant (used only to word
   *  the "not yet recorded" reason — NOT for any rate/JPL computation). */
  attendanceRecorded: number;
  /** Of those, how many are a "present" status (HADIR). Binary gate: > 0. */
  attendancePresent: number;
  /** Whether the test was completed/submitted. `undefined` = no test row. */
  testCompleted: boolean;
  /** The recorded score, when a test row exists. */
  score: number | null;
  /** Whether the participant is CANCELLED (excluded from eligibility). */
  cancelled?: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  /** Short Indonesian reason, safe to show in the UI. */
  reason: string;
}

/**
 * Decides certificate eligibility for one participant.
 *
 * Order of checks (fail fast, most-fundamental first):
 *   1. Cancelled participants are never eligible.
 *   2. Attendance (ALL modes): the participant must actually have ATTENDED —
 *      at least one HADIR record. Merely being registered is not enough;
 *      TIDAK_HADIR / SAKIT / IZIN (with no HADIR) and incomplete attendance
 *      (no records) are NOT eligible. This is the "stored attendance rule".
 *   3. Test requirement (Modes B/C, or when `requireTest` is set): the test
 *      must be completed.
 *   4. Minimum score (when `requireMinScore`): the score must exist and meet
 *      the threshold. A missing score never "passes".
 *
 * ATTENDANCE IS BINARY (business decision, C1 — FINAL):
 *   One valid HADIR means the participant is considered to have attended the
 *   whole activity. There is NO percentage/pro-rated attendance gate. The
 *   legacy `minAttendanceRate` column is retained ONLY for backward data
 *   compatibility and is deliberately NOT consulted here — it no longer has any
 *   effect on certificate eligibility or JPL. See `CertificatePolicy` below.
 */
export function evaluateEligibility(
  policy: CertificatePolicy,
  progress: ParticipantProgress,
): EligibilityResult {
  if (progress.cancelled) {
    return { eligible: false, reason: "Peserta dibatalkan (CANCELLED)." };
  }

  // Attendance gate — applies in EVERY mode. A certificate requires the
  // participant to have attended at least one session (HADIR). SAKIT/IZIN do
  // not count as present, and a participant with no attendance records at all
  // is "incomplete", never a pass. Attendance is BINARY: ≥1 HADIR = attended.
  if (progress.attendancePresent <= 0) {
    if (progress.attendanceRecorded <= 0) {
      return { eligible: false, reason: "Presensi belum dicatat (belum lengkap)." };
    }
    return { eligible: false, reason: "Peserta tidak hadir (tidak ada status HADIR)." };
  }

  const isTestMode = policy.mode === "TEST_SCORED" || policy.mode === "TEST_COMPLETION";
  const testRequired = isTestMode || policy.requireTest;

  if (testRequired && !progress.testCompleted) {
    return { eligible: false, reason: "Tes belum diselesaikan/dikumpulkan." };
  }

  if (policy.requireMinScore) {
    if (progress.score == null) {
      return { eligible: false, reason: "Nilai belum tersedia (syarat nilai minimum aktif)." };
    }
    const min = policy.minScore ?? 0;
    if (progress.score < min) {
      return { eligible: false, reason: `Nilai ${formatScore(progress.score)} < minimum ${formatScore(min)}.` };
    }
  }

  // NOTE (C1 — FINAL): `policy.minAttendanceRate` is intentionally NOT used.
  // Business rule: attendance is binary (≥1 HADIR), so there is no percentage
  // gate. Any stored value is ignored to avoid a misleading, session-model-
  // dependent rule. The field is kept only for DB/config backward compatibility.

  const scoreNote =
    policy.requireMinScore && progress.score != null
      ? ` (nilai ${formatScore(progress.score)})`
      : "";
  return { eligible: true, reason: `Memenuhi syarat${scoreNote}.` };
}

function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Normalises a possibly-partial policy row into a concrete policy with safe
 * defaults (mode → ATTENDANCE_ONLY, flags → false).
 */
export function normalizePolicy(row: {
  certificateMode?: string | null;
  requireTest?: boolean | null;
  requireMinScore?: boolean | null;
  minScore?: number | null;
  showScore?: boolean | null;
  minAttendanceRate?: number | null;
}): CertificatePolicy {
  const mode = isCertificateMode(row.certificateMode) ? row.certificateMode : "ATTENDANCE_ONLY";
  return {
    mode,
    requireTest: Boolean(row.requireTest),
    requireMinScore: Boolean(row.requireMinScore),
    minScore: row.minScore ?? null,
    showScore: Boolean(row.showScore),
    minAttendanceRate: row.minAttendanceRate ?? null,
  };
}
