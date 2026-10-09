import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { logServerError, safeErrorMessage } from "@/lib/logger";

const UpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  location: z.string().trim().max(200).optional().nullable(),
  capacity: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "ONGOING", "COMPLETED", "CANCELLED"]).optional(),
  // Certificate policy (additive) — all optional; only provided fields change.
  certificateMode: z.enum(["ATTENDANCE_ONLY", "TEST_SCORED", "TEST_COMPLETION"]).optional(),
  requireTest: z.boolean().optional(),
  requireMinScore: z.boolean().optional(),
  minScore: z.coerce.number().min(0).max(100).optional().nullable(),
  showScore: z.boolean().optional(),
  minAttendanceRate: z.coerce.number().int().min(0).max(100).optional().nullable(),
});

const detailInclude = {
  participants: {
    include: {
      staff: { select: { id: true, name: true, profession: true, room: { select: { name: true } } } },
    },
    orderBy: { registeredAt: "desc" as const },
  },
  attendance: true,
  assessments: true,
  certificates: true,
  instructors: true,
};

async function guard(permission: string) {
  const { authorized, user } = await checkPermission(permission);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(PERMISSIONS.DIKLAT_TRAINING_READ);
  if (denied) return denied;

  const { id } = await params;
  const training = await prisma.training.findUnique({ where: { id }, include: detailInclude });
  if (!training) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);
  return ok({ training });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_UPDATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const existing = await prisma.training.findUnique({ where: { id } });
  if (!existing) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(UpdateSchema, body);
  if (error) return error;

  // Certificate-policy consistency: a required minimum score needs a value.
  const nextRequireMinScore = data.requireMinScore ?? existing.requireMinScore;
  const nextMinScore = data.minScore !== undefined ? data.minScore : existing.minScore;
  if (nextRequireMinScore && (nextMinScore == null)) {
    return err(
      "MIN_SCORE_REQUIRED",
      "Nilai minimum wajib diisi bila syarat nilai minimum diaktifkan.",
      422,
      { minScore: ["Nilai minimum wajib diisi"] },
    );
  }

  try {
    const training = await prisma.training.update({
      where: { id },
      data: {
        ...data,
        // Changing the policy must NOT retroactively alter issued certificates —
        // issuance reads the policy at issue time and stores the result, so we
        // simply persist the new policy here.
      },
    });
    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "training",
      resourceId: id,
      action: "UPDATED",
      before: {
        status: existing.status,
        title: existing.title,
        certificateMode: existing.certificateMode,
        requireMinScore: existing.requireMinScore,
        minScore: existing.minScore,
        showScore: existing.showScore,
        minAttendanceRate: existing.minAttendanceRate,
      },
      after: {
        status: training.status,
        title: training.title,
        certificateMode: training.certificateMode,
        requireMinScore: training.requireMinScore,
        minScore: training.minScore,
        showScore: training.showScore,
        minAttendanceRate: training.minAttendanceRate,
      },
      ipAddress: clientIp(req),
    });
    return ok({ training });
  } catch (e) {
    logServerError("diklat-trainings-$id$", e);
    return err("UPDATE_FAILED", safeErrorMessage("UPDATE_FAILED"), 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_DELETE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const existing = await prisma.training.findUnique({
    where: { id },
    include: { _count: { select: { certificates: true } } },
  });
  if (!existing) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);
  if (existing._count.certificates > 0) {
    return err(
      "HAS_CERTIFICATES",
      "Sertifikat sudah terbit — ubah status menjadi CANCELLED alih-alih menghapus.",
      409
    );
  }

  try {
    await prisma.training.delete({ where: { id } });
    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "training",
      resourceId: id,
      action: "DELETED",
      before: { title: existing.title },
      ipAddress: clientIp(_req),
    });
    return ok({ deleted: true });
  } catch {
    return err("DELETE_FAILED", "Gagal menghapus pelatihan", 500);
  }
}
