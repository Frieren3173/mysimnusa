import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";

const UpsertSchema = z.object({
  staffId: z.string().min(1),
  score: z.coerce.number().min(0).max(100).nullable().optional(),
  grade: z.string().trim().max(10).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

function deriveGrade(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "E";
}

async function guard(permission: string) {
  const { authorized, user } = await checkPermission(permission);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(PERMISSIONS.DIKLAT_TRAINING_MANAGE_ATTENDANCE);
  if (denied) return denied;

  const { id } = await params;
  const assessments = await prisma.trainingAssessment.findMany({
    where: { trainingId: id },
    orderBy: { updatedAt: "desc" },
  });
  return ok({ assessments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_MANAGE_ATTENDANCE);
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

  const payload = {
    score: data.score ?? null,
    grade: grade ?? null,
    notes: data.notes ?? null,
  };

  const assessment = existing
    ? await prisma.trainingAssessment.update({ where: { id: existing.id }, data: payload })
    : await prisma.trainingAssessment.create({
        data: { trainingId: id, staffId: data.staffId, ...payload },
      });

  return ok({ assessment });
}
