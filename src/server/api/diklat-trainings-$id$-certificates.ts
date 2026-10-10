import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { issueCertificatesForTraining } from "@/lib/diklat/certificate-issuance";
import { logServerError, safeErrorMessage } from "@/lib/logger";

/**
 * Manual certificate issue — routes through the SHARED issuance service so the
 * activity's certificate policy (mode, ≥1 HADIR attendance, test, min score) is
 * always enforced. There is exactly one source of truth for "may this
 * participant receive a certificate?". Attendance is binary; the legacy
 * `minAttendanceRate` percentage gate is no longer applied.
 */
const IssueSchema = z.object({
  staffId: z.string().min(1),
});

async function guard(permission: string) {
  const { authorized, user } = await checkPermission(permission);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(PERMISSIONS.DIKLAT_CERTIFICATE_READ);
  if (denied) return denied;

  const { id } = await params;
  const certificates = await prisma.certificate.findMany({
    where: { trainingId: id },
    orderBy: { issuedDate: "desc" },
  });
  return ok({ certificates });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_CERTIFICATE_ISSUE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const training = await prisma.training.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!training) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(IssueSchema, body);
  if (error) return error;

  // The participant must belong to this activity (guards cross-activity issue).
  const participant = await prisma.trainingParticipant.findUnique({
    where: { trainingId_staffId: { trainingId: id, staffId: data.staffId } },
    select: { staffId: true },
  });
  if (!participant) return err("NOT_PARTICIPANT", "Petugas bukan peserta pelatihan ini", 404);

  try {
    const summary = await issueCertificatesForTraining(id, {
      trigger: "MANUAL",
      actorUserId: user.id,
      staffIds: [data.staffId],
    });

    // A CANCELLED activity never issues.
    if (summary.cancelled) {
      return err(
        "TRAINING_CANCELLED",
        "Kegiatan dibatalkan — sertifikat tidak dapat diterbitkan.",
        409,
      );
    }

    const result = summary.results[0];
    if (!result) return err("ISSUE_FAILED", "Gagal menerbitkan sertifikat", 500);

    // Already issued → idempotent no-op (do not create a duplicate).
    if (result.alreadyIssued) {
      const existing = await prisma.certificate.findFirst({
        where: { trainingId: id, staffId: data.staffId },
      });
      return ok({ certificate: existing });
    }

    // Not eligible → surface the policy reason (attendance/test/score).
    if (!result.issued) {
      return err("NOT_ELIGIBLE", result.reason || "Peserta belum memenuhi syarat", 422);
    }

    const certificate = await prisma.certificate.findFirst({
      where: { trainingId: id, staffId: data.staffId },
    });

    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "certificate",
      resourceId: certificate?.id ?? id,
      action: "CREATED",
      after: { certificateNumber: result.certificateNumber, trainingId: id, staffId: data.staffId, trigger: "MANUAL" },
      ipAddress: clientIp(req),
    });

    return ok({ certificate });
  } catch (e) {
    logServerError("diklat.certificates.issue", e);
    return err("ISSUE_FAILED", safeErrorMessage("ISSUE_FAILED"), 500);
  }
}
