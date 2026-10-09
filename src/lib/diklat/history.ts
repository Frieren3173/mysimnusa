import { prisma } from "@/lib/prisma";
import { ANNUAL_JPL_TARGET } from "@/lib/diklat/jpl";

/**
 * One staff member's training history (shared by the detail page + API).
 *
 * Returns each activity the staff participates in, with the JPL they actually
 * EARNED (only when attended — >=1 HADIR — and the activity is not CANCELLED),
 * plus score/grade/test/certificate when present. No data is fabricated.
 */
export interface HistoryItem {
  trainingId: string;
  title: string;
  category: string | null;
  startDate: string;
  endDate: string;
  location: string | null;
  trainingStatus: string;
  participationStatus: string;
  attended: boolean;
  activityJpl: number | null;
  jplEarned: number;
  score: number | null;
  grade: string | null;
  testCompleted: boolean;
  certificateNumber: string | null;
  certificateIssuedAt: string | null;
}

export interface StaffHistory {
  staff: { id: string; name: string; nip: string | null; profession: string; roomName: string | null };
  year: number | null;
  targetJpl: number;
  totalJpl: number;
  qualifyingActivities: number;
  items: HistoryItem[];
}

export async function getStaffHistory(staffId: string, year: number | null): Promise<StaffHistory | null> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { id: true, name: true, nip: true, profession: true, room: { select: { name: true } } },
  });
  if (!staff) return null;

  const from = year ? new Date(Date.UTC(year, 0, 1)) : undefined;
  const to = year ? new Date(Date.UTC(year + 1, 0, 1)) : undefined;

  const participants = await prisma.trainingParticipant.findMany({
    where: { staffId, training: year ? { startDate: { gte: from, lt: to } } : undefined },
    select: {
      status: true,
      certificateIssuedAt: true,
      training: {
        select: {
          id: true,
          title: true,
          category: true,
          startDate: true,
          endDate: true,
          location: true,
          status: true,
          jpl: true,
        },
      },
    },
    orderBy: { training: { startDate: "desc" } },
  });

  const trainingIds = participants.map((p) => p.training.id);
  const [hadirRows, assessments, certificates] = await Promise.all([
    trainingIds.length
      ? prisma.trainingAttendance.findMany({
          where: { staffId, trainingId: { in: trainingIds }, status: "HADIR" },
          select: { trainingId: true },
        })
      : Promise.resolve([]),
    trainingIds.length
      ? prisma.trainingAssessment.findMany({
          where: { staffId, trainingId: { in: trainingIds } },
          select: { trainingId: true, score: true, grade: true, completed: true },
        })
      : Promise.resolve([]),
    trainingIds.length
      ? prisma.certificate.findMany({
          where: { staffId, trainingId: { in: trainingIds } },
          select: { trainingId: true, certificateNumber: true },
        })
      : Promise.resolve([]),
  ]);

  const attended = new Set(hadirRows.map((r) => r.trainingId));
  const aByT = new Map(assessments.map((a) => [a.trainingId, a]));
  const cByT = new Map(certificates.map((c) => [c.trainingId, c.certificateNumber]));

  const items: HistoryItem[] = participants.map((p) => {
    const t = p.training;
    const attendedOk = attended.has(t.id) && t.status !== "CANCELLED";
    const a = aByT.get(t.id);
    return {
      trainingId: t.id,
      title: t.title,
      category: t.category,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
      location: t.location,
      trainingStatus: t.status,
      participationStatus: p.status,
      attended: attendedOk,
      activityJpl: t.jpl,
      jplEarned: attendedOk ? (t.jpl ?? 0) : 0,
      score: a?.score ?? null,
      grade: a?.grade ?? null,
      testCompleted: a?.completed ?? false,
      certificateNumber: cByT.get(t.id) ?? null,
      certificateIssuedAt: p.certificateIssuedAt?.toISOString() ?? null,
    };
  });

  return {
    staff: {
      id: staff.id,
      name: staff.name,
      nip: staff.nip,
      profession: staff.profession,
      roomName: staff.room?.name ?? null,
    },
    year,
    targetJpl: ANNUAL_JPL_TARGET,
    totalJpl: items.reduce((sum, x) => sum + x.jplEarned, 0),
    qualifyingActivities: items.filter((x) => x.jplEarned > 0).length,
    items,
  };
}
