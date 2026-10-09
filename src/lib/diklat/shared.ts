/**
 * Shared, pure helpers for the Diklat/IHT module.
 *
 * Kept free of Prisma/React so the status, date, and reporting logic can be
 * unit-tested and reused by both Server and Client Components.
 */

export const TRAINING_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "ONGOING",
  "COMPLETED",
  "CANCELLED",
] as const;

export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export const TRAINING_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Terbuka",
  ONGOING: "Berlangsung",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

/** Indonesian label for a training status (falls back to the raw value). */
export function trainingStatusLabel(status: string): string {
  return TRAINING_STATUS_LABELS[status] ?? status;
}

export const PARTICIPANT_STATUSES = ["REGISTERED", "CONFIRMED", "CANCELLED"] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const PARTICIPANT_STATUS_LABELS: Record<string, string> = {
  REGISTERED: "Terdaftar",
  CONFIRMED: "Dikonfirmasi",
  CANCELLED: "Dibatalkan",
};

export const ATTENDANCE_STATUSES = ["HADIR", "TIDAK_HADIR", "SAKIT", "IZIN"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  HADIR: "Hadir",
  TIDAK_HADIR: "Tidak Hadir",
  SAKIT: "Sakit",
  IZIN: "Izin",
};

/**
 * Whether an end date is on/after a start date (inclusive; date-only compare).
 * Invalid dates return false so callers can surface a validation error.
 */
export function isValidDateRange(start: Date | string, end: Date | string): boolean {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
  return e.getTime() >= s.getTime();
}

/**
 * Period filter for reports: a compact `YYYY-MM` → an inclusive [from, to) date
 * range. Returns null when the input is not a valid `YYYY-MM`.
 */
export function periodToRange(period: string | null | undefined): { from: Date; to: Date } | null {
  if (!period) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { from, to };
}

/**
 * A participant counts as "attended" when they have at least one HADIR record.
 * Returns a compact per-participant attendance summary.
 */
export interface AttendanceLike {
  staffId: string;
  status: string;
}

export function attendanceSummary(
  rows: AttendanceLike[],
  staffIds: string[],
): Map<string, { hadir: number; total: number; rate: number }> {
  const map = new Map<string, { hadir: number; total: number; rate: number }>();
  for (const id of staffIds) map.set(id, { hadir: 0, total: 0, rate: 0 });
  for (const r of rows) {
    const cur = map.get(r.staffId);
    if (!cur) continue;
    cur.total += 1;
    if (r.status === "HADIR") cur.hadir += 1;
  }
  for (const v of map.values()) {
    v.rate = v.total === 0 ? 0 : Math.round((v.hadir / v.total) * 100);
  }
  return map;
}
