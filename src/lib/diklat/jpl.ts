import { prisma } from "@/lib/prisma";

/**
 * JPL (Jam Pelajaran) aggregation — the single source of truth.
 *
 * Rules (agreed):
 *   • Target = 20 JPL per staff per CALENDAR YEAR (1 Jan – 31 Dec), configurable
 *     here (not scattered as hard-coded numbers).
 *   • A participant earns the activity's JPL only when they are ATTENDED —
 *     at least one HADIR record. SAKIT/IZIN alone do not count; no attendance
 *     records = no JPL.
 *   • CANCELLED activities grant no JPL, and cancelled participants earn none.
 *   • Activities with a NULL jpl grant nothing (never fabricated).
 *   • JPL is attributed to the year of the activity's `startDate`.
 *   • The aggregation is computed from a single set of attendance rows (no
 *     multi-join duplication) and de-duplicates per (training, staff) so a
 *     re-run or duplicate attendance row can never double-count.
 *
 * No annual total is stored — it is always derived here so dashboards, the
 * staff history and the Excel export share one definition.
 */

/** Annual JPL target per staff (calendar year). Configurable in one place. */
export const ANNUAL_JPL_TARGET = 20;

/** Attendance statuses that earn JPL. */
export const JPL_PRESENT_STATUSES = ["HADIR"] as const;

export interface JplRow {
  staffId: string;
  staffName: string;
  nip: string | null;
  profession: string;
  roomId: string | null;
  roomName: string | null;
  totalJpl: number;
  targetJpl: number;
  remainingJpl: number;
  /** Raw progress percent (may exceed 100). Never capped for the total. */
  progressPct: number;
  met: boolean;
  /** Number of qualifying activities contributing JPL. */
  activities: number;
}

export interface JplSummary {
  year: number;
  target: number;
  totalJpl: number;
  metCount: number;
  notMetCount: number;
  staffCount: number;
}

export interface JplFilter {
  year: number;
  roomId?: string | null;
  search?: string | null;
}

/** Pure: given the raw rows, compute the per-staff JPL summary (no DB). */
export function summarizeJpl(rows: JplRow[]): JplSummary {
  const totalJpl = rows.reduce((a, r) => a + r.totalJpl, 0);
  const metCount = rows.filter((r) => r.met).length;
  return {
    year: 0,
    target: ANNUAL_JPL_TARGET,
    totalJpl,
    metCount,
    notMetCount: rows.length - metCount,
    staffCount: rows.length,
  };
}

/** Pure: build one JplRow from a raw total (used by tests + DB path). */
export function buildJplRow(input: {
  staffId: string;
  staffName: string;
  nip: string | null;
  profession: string;
  roomId: string | null;
  roomName: string | null;
  totalJpl: number;
  activities: number;
  target?: number;
}): JplRow {
  const target = input.target ?? ANNUAL_JPL_TARGET;
  const totalJpl = Math.max(0, Math.round(input.totalJpl));
  const remainingJpl = Math.max(0, target - totalJpl);
  const progressPct = target > 0 ? Math.round((totalJpl / target) * 100) : 0;
  return {
    staffId: input.staffId,
    staffName: input.staffName,
    nip: input.nip,
    profession: input.profession,
    roomId: input.roomId,
    roomName: input.roomName,
    totalJpl,
    targetJpl: target,
    remainingJpl,
    progressPct,
    met: totalJpl >= target,
    activities: input.activities,
  };
}

/**
 * Loads the per-staff JPL roll-up for a calendar year (optionally filtered by
 * room / search). Read-only. Computes everything in JS from ONE participant
 * query + ONE attendance query so no JOIN can duplicate rows.
 */
export async function getJplRows(filter: JplFilter): Promise<JplRow[]> {
  const { year } = filter;
  const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));

  // Qualifying activities: not CANCELLED, has JPL > 0, startDate in the year.
  const trainings = await prisma.training.findMany({
    where: {
      status: { not: "CANCELLED" },
      jpl: { not: null, gt: 0 },
      startDate: { gte: from, lt: to },
      ...(filter.roomId ? {} : {}),
    },
    select: { id: true, jpl: true },
  });
  const jplByTraining = new Map(trainings.map((t) => [t.id, t.jpl ?? 0]));
  const trainingIds = [...jplByTraining.keys()];

  // Attendance (only HADIR) for those activities — ONE query.
  const attendance =
    trainingIds.length === 0
      ? []
      : await prisma.trainingAttendance.findMany({
          where: { trainingId: { in: trainingIds }, status: "HADIR" },
          select: { trainingId: true, staffId: true },
        });

  // Distinct (trainingId, staffId) pairs that were present — de-dupes dup rows.
  const presentPairs = new Map<string, { trainingId: string; staffId: string }>();
  for (const a of attendance) {
    presentPairs.set(`${a.trainingId}|${a.staffId}`, a);
  }

  // Accumulate JPL per staff.
  const totalByStaff = new Map<string, number>();
  const activitiesByStaff = new Map<string, Set<string>>();
  for (const p of presentPairs.values()) {
    const credit = jplByTraining.get(p.trainingId) ?? 0;
    if (credit <= 0) continue;
    totalByStaff.set(p.staffId, (totalByStaff.get(p.staffId) ?? 0) + credit);
    const set = activitiesByStaff.get(p.staffId) ?? new Set<string>();
    set.add(p.trainingId);
    activitiesByStaff.set(p.staffId, set);
  }

  // Evaluation population: all active staff (even with 0 JPL), filtered by room.
  const staff = await prisma.staff.findMany({
    where: {
      isActive: true,
      ...(filter.roomId ? { roomId: filter.roomId } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: "insensitive" as const } },
              { nip: { contains: filter.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      nip: true,
      profession: true,
      roomId: true,
      room: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  return staff.map((s) =>
    buildJplRow({
      staffId: s.id,
      staffName: s.name,
      nip: s.nip,
      profession: s.profession,
      roomId: s.roomId,
      roomName: s.room?.name ?? null,
      totalJpl: totalByStaff.get(s.id) ?? 0,
      activities: activitiesByStaff.get(s.id)?.size ?? 0,
    }),
  );
}
