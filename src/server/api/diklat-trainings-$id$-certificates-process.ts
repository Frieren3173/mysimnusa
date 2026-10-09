import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import {
  issueCertificatesForTraining,
  notifyCertificateReady,
} from "@/lib/diklat/certificate-issuance";
import { logServerError, safeErrorMessage } from "@/lib/logger";

/**
 * POST /api/diklat/trainings/:id/certificates/process
 *
 * Evaluates eligibility for the activity's participants and issues certificates
 * for those who qualify — idempotently. Optional `staffIds` narrows the scope
 * (used by the per-row action); omitted → all participants.
 *
 * Requires `diklat.certificate.issue`. This is the manual/system trigger; the
 * attendance & assessment routes also trigger auto-issuance for the affected
 * participant only.
 */
const ProcessSchema = z.object({
  staffIds: z.array(z.string().min(1)).max(500).optional(),
  notify: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_CERTIFICATE_ISSUE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses menerbitkan sertifikat", 403);

  const { id } = await params;
  const training = await prisma.training.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!training) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);

  const body = await req.json().catch(() => ({}));
  const { data, error } = parseBody(ProcessSchema, body ?? {});
  if (error) return error;

  try {
    const summary = await issueCertificatesForTraining(id, {
      trigger: "MANUAL",
      actorUserId: user.id,
      staffIds: data.staffIds,
    });

    // In-app notification for newly-issued certificates (best-effort; the only
    // delivery channel that exists — never claim email).
    let notified = 0;
    if (data.notify) {
      for (const r of summary.results) {
        if (r.issued) {
          const sent = await notifyCertificateReady(training.title, r.staffId);
          if (sent) {
            notified += 1;
            await prisma.trainingParticipant.updateMany({
              where: { trainingId: id, staffId: r.staffId },
              data: { notifiedAt: new Date() },
            });
          }
        }
      }
    }

    return ok({
      processed: summary.processed,
      issued: summary.issued,
      alreadyIssued: summary.alreadyIssued,
      notEligible: summary.notEligible,
      notified,
      results: summary.results,
    });
  } catch (e) {
    logServerError("diklat.certificates.process", e);
    return err("PROCESS_FAILED", safeErrorMessage("PROCESS_FAILED"), 500);
  }
}
