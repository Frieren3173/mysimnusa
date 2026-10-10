import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkAnyPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { issueCertificatesForTraining } from "@/lib/diklat/certificate-issuance";
import { logServerError } from "@/lib/logger";

const UpsertSchema = z.object({
  staffId: z.string().min(1),
  score: z.coerce.number().min(0).max(100).nullable().optional(),
  grade: z.string().trim().max(10).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  /// Whether the test has been completed/submitted (Mode B/C gate).
  completed: z.boolean().optional(),
});

function deriveGrade(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "E";
}

/**
 * Assessment management is granted by the dedicated
 * `diklat.training.manage_assessment` permission OR the legacy
 * `diklat.training.manage_attendance` (so existing roles keep working).
 */
const ASSESSMENT_PERMISSIONS = [
  PERMISSIONS.DIKLAT_TRAINING_MANAGE_ASSESSMENT,
  PERMISSIONS.DIKLAT_TRAINING_MANAGE_ATTENDANCE,
];

async function guard() {
  const { authorized, user } = await checkAnyPermission(ASSESSMENT_PERMISSIONS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await params;
  const assessments = await prisma.trainingAssessment.findMany({
    where: { trainingId: id },
    orderBy: { updatedAt: "desc" },
  });
  return ok({ assessments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkAnyPermission(ASSESSMENT_PERMISSIONS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const training = await prisma.training.findUnique({ where: { id } });
  if (!training) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(UpsertSchema, body);
  if (error) return error;

  const participant = await prisma.trainingParticipant.findUnique({
    where: { trainingId_staffId: { trainingId: id, staffId: data.staffId } },
  });
  if (!participant) return err("NOT_PARTICIPANT", "Petugas bukan peserta pelatihan ini", 404);

  const grade = data.grade ?? deriveGrade(data.score);

  const existing = await prisma.trainingAssessment.findUnique({
    where: { trainingId_staffId: { trainingId: id, staffId: data.staffId } },
  });

  // Completion precedence (explicit, documented):
  //   1. `completed` explicitly sent  → honour it (true OR false).
  //   2. a score is being saved       → the test is considered completed.
  //   3. otherwise                    → keep the existing value (default false).
  const nextCompleted =
    data.completed !== undefined
      ? data.completed
      : data.score != null
        ? true
        : (existing?.completed ?? false);
  const completedAt = nextCompleted
    ? (existing?.completedAt ?? new Date())
    : null;

  const payload = {
    score: data.score ?? existing?.score ?? null,
    grade: grade ?? existing?.grade ?? null,
    notes: data.notes !== undefined ? data.notes : existing?.notes ?? null,
    completed: nextCompleted,
    completedAt,
  };

  const assessment = existing
    ? await prisma.trainingAssessment.update({ where: { id: existing.id }, data: payload })
    : await prisma.trainingAssessment.create({
        data: { trainingId: id, staffId: data.staffId, ...payload },
      });

  // Auto-issuance: a completed test (and/or a passing score) may qualify the
  // participant. Idempotent + scoped to this participant; never blocks the save.
  let certificate: { issued: boolean; eligible: boolean; reason: string } | null = null;
  try {
    const summary = await issueCertificatesForTraining(id, {
      trigger: "AUTO_ASSESSMENT",
      staffIds: [data.staffId],
    });
    const r = summary.results[0];
    if (r) certificate = { issued: r.issued, eligible: r.eligible, reason: r.reason };
  } catch (e) {
    logServerError("diklat.assessment.auto-issue", e);
  }

  return ok({ assessment, certificate });
}
