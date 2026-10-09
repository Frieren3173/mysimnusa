import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { logServerError } from "@/lib/logger";
import {
  buildCertificateNumber,
  DEFAULT_NUMBER_PATTERN,
  DEFAULT_NUMBER_PREFIX,
} from "@/lib/diklat/certificate";
import {
  evaluateEligibility,
  normalizePolicy,
  type CertificatePolicy,
  type ParticipantProgress,
} from "@/lib/diklat/certificate-policy";

/**
 * Idempotent certificate issuance for Diklat/IHT.
 *
 * Design:
 *  • Reuses the EXISTING `Certificate` table and the existing numbering
 *    helpers — no new table, no new generator.
 *  • Idempotent & concurrency-safe: it checks for an existing certificate first
 *    and relies on the `certificateNumber @unique` + a `[trainingId, staffId]`
 *    membership check + participant `certificateIssuedAt` marker, so a retry or
 *    two concurrent runs never create a duplicate.
 *  • Eligibility is recomputed from the CURRENT attendance/assessment rows; an
 *    already-issued certificate is NEVER revoked or altered (immutability).
 *  • Delivery: the only channel that exists is an in-app Notification — we never
 *    claim an email was sent.
 */

export type IssueTrigger = "MANUAL" | "AUTO_ATTENDANCE" | "AUTO_ASSESSMENT";

export interface IssueResult {
  staffId: string;
  eligible: boolean;
  issued: boolean;
  /** true when a certificate already existed (idempotent no-op). */
  alreadyIssued: boolean;
  reason: string;
  certificateNumber?: string;
}

export interface IssueSummary {
  processed: number;
  issued: number;
  alreadyIssued: number;
  notEligible: number;
  /** True when issuance was skipped because the activity is CANCELLED. */
  cancelled?: boolean;
  results: IssueResult[];
}

/** Loads the policy + per-participant progress for one activity. */
async function loadProgress(trainingId: string) {
  const [training, participants, attendance, assessments] = await Promise.all([
    prisma.training.findUnique({
      where: { id: trainingId },
      select: {
        id: true,
        title: true,
        status: true,
        certificateMode: true,
        requireTest: true,
        requireMinScore: true,
        minScore: true,
        showScore: true,
        minAttendanceRate: true,
      },
    }),
    prisma.trainingParticipant.findMany({
      where: { trainingId },
      select: { id: true, staffId: true, status: true, certificateIssuedAt: true },
    }),
    prisma.trainingAttendance.findMany({
      where: { trainingId },
      select: { staffId: true, status: true },
    }),
    prisma.trainingAssessment.findMany({
      where: { trainingId },
      select: { staffId: true, score: true, completed: true },
    }),
  ]);
  return { training, participants, attendance, assessments };
}

function progressFor(
  staffId: string,
  attendance: { staffId: string; status: string }[],
  assessments: { staffId: string; score: number | null; completed: boolean }[],
  cancelled: boolean,
): ParticipantProgress {
  const myAtt = attendance.filter((a) => a.staffId === staffId);
  const present = myAtt.filter((a) => a.status === "HADIR").length;
  const assessment = assessments.find((a) => a.staffId === staffId);
  return {
    participantCount: 0,
    attendanceRecorded: myAtt.length,
    attendancePresent: present,
    testCompleted: assessment?.completed ?? false,
    score: assessment?.score ?? null,
    cancelled,
  };
}

/**
 * Issues certificates for every eligible participant of an activity.
 *
 * Passing `staffIds` narrows the scope (used by the manual action). The
 * function is safe to call repeatedly (auto-trigger after each attendance or
 * assessment save): already-issued participants are skipped.
 */
export async function issueCertificatesForTraining(
  trainingId: string,
  opts: { trigger: IssueTrigger; actorUserId?: string | null; staffIds?: string[] } = {
    trigger: "MANUAL",
  },
): Promise<IssueSummary> {
  const { training, participants, attendance, assessments } = await loadProgress(trainingId);
  if (!training) throw new Error("Pelatihan tidak ditemukan");

  // A CANCELLED activity must never issue certificates — via the manual
  // endpoint, the batch `process` route, or an auto-trigger. This is the single
  // source of truth (the shared service) so no alternative issue path can slip
  // past it. We return a zero-issued summary rather than throwing, so callers
  // surface an explicit "no issuance" result.
  if (training.status === "CANCELLED") {
    const scoped = opts.staffIds
      ? participants.filter((p) => opts.staffIds!.includes(p.staffId))
      : participants;
    return {
      processed: scoped.length,
      issued: 0,
      alreadyIssued: 0,
      notEligible: scoped.length,
      cancelled: true,
      results: scoped.map((p) => ({
        staffId: p.staffId,
        eligible: false,
        issued: false,
        alreadyIssued: false,
        reason: "Kegiatan dibatalkan (CANCELLED) — sertifikat tidak diterbitkan.",
      })),
    };
  }

  const policy: CertificatePolicy = normalizePolicy(training);

  const scoped = opts.staffIds
    ? participants.filter((p) => opts.staffIds!.includes(p.staffId))
    : participants;

  // Existing certificates for this training (idempotency).
  const existing = await prisma.certificate.findMany({
    where: { trainingId },
    select: { staffId: true, certificateNumber: true },
  });
  const issuedByStaff = new Map(existing.map((c) => [c.staffId, c.certificateNumber]));

  // Next sequence = highest numeric suffix already used in this activity + 1.
  const allNumbers = await prisma.certificate.findMany({
    where: { trainingId },
    select: { certificateNumber: true },
  });
  const usedNumbers = new Set(allNumbers.map((c) => c.certificateNumber));
  let seq = allNumbers.reduce((max, c) => {
    const m = c.certificateNumber.match(/(\d+)\s*\/\s*[IVX]+\s*\/\s*\d{4}\s*$/);
    const n = m ? Number(m[1]) : 0;
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  const results: IssueResult[] = [];
  let issued = 0;
  let alreadyIssued = 0;
  let notEligible = 0;

  for (const p of scoped) {
    // Already has a certificate → immutable, idempotent no-op.
    const existingNo = issuedByStaff.get(p.staffId);
    if (existingNo || p.certificateIssuedAt) {
      alreadyIssued += 1;
      results.push({
        staffId: p.staffId,
        eligible: true,
        issued: false,
        alreadyIssued: true,
        reason: "Sertifikat sudah terbit.",
        certificateNumber: existingNo,
      });
      continue;
    }

    const progress = progressFor(
      p.staffId,
      attendance,
      assessments,
      p.status === "CANCELLED",
    );
    const decision = evaluateEligibility(policy, progress);

    // Persist the latest eligibility assessment (never touches issued certs).
    await prisma.trainingParticipant.update({
      where: { id: p.id },
      data: { eligible: decision.eligible, eligibilityReason: decision.reason },
    });

    if (!decision.eligible) {
      notEligible += 1;
      results.push({
        staffId: p.staffId,
        eligible: false,
        issued: false,
        alreadyIssued: false,
        reason: decision.reason,
      });
      continue;
    }

    // Allocate a unique number and create the certificate. Two uniqueness
    // guards make this safe under concurrency + retries:
    //   • [trainingId, staffId] unique  → a duplicate attempt is a no-op.
    //   • certificateNumber unique      → a number collision just re-allocates.
    let created = false;
    const MAX_ATTEMPTS = 8;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !created; attempt++) {
      // Recompute the next sequence from the DB each attempt so concurrently
      // committed numbers are never reused. `certificateNumber` is UNIQUE
      // GLOBALLY (not per-training), so allocation must consider every
      // existing number, otherwise two activities would collide.
      const latest = await prisma.certificate.findMany({
        select: { certificateNumber: true },
      });
      const takenNow = new Set(latest.map((c) => c.certificateNumber));
      let candidateSeq = latest.reduce((max, c) => {
        const m = c.certificateNumber.match(/(\d+)\s*\/\s*[IVX]+\s*\/\s*\d{4}\s*$/);
        const n = m ? Number(m[1]) : 0;
        return Number.isFinite(n) && n > max ? n : max;
      }, Math.max(seq, allNumbers.length));

      let candidate = "";
      let guard = 0;
      do {
        candidateSeq += 1;
        candidate = buildCertificateNumber(DEFAULT_NUMBER_PATTERN, {
          prefix: DEFAULT_NUMBER_PREFIX,
          seq: candidateSeq,
          date: new Date(),
        });
        guard += 1;
      } while (takenNow.has(candidate) && guard < 1000);

      try {
        const cert = await prisma.certificate.create({
          data: {
            trainingId,
            staffId: p.staffId,
            certificateNumber: candidate,
            issuedDate: new Date(),
            issuedById: opts.actorUserId ?? null,
            trigger: opts.trigger,
          },
        });
        seq = candidateSeq;
        usedNumbers.add(candidate);
        issuedByStaff.set(p.staffId, cert.certificateNumber);
        await prisma.trainingParticipant.update({
          where: { id: p.id },
          data: { certificateIssuedAt: cert.issuedDate, eligible: true },
        });
        created = true;
        issued += 1;
        results.push({
          staffId: p.staffId,
          eligible: true,
          issued: true,
          alreadyIssued: false,
          reason: decision.reason,
          certificateNumber: cert.certificateNumber,
        });
      } catch (e) {
        if ((e as { code?: string })?.code === "P2002") {
          // Which constraint? If a certificate for this (training, staff) now
          // exists → another run won the race: idempotent stop.
          const mine = await prisma.certificate.findFirst({
            where: { trainingId, staffId: p.staffId },
            select: { certificateNumber: true },
          });
          if (mine) {
            alreadyIssued += 1;
            created = true;
            results.push({
              staffId: p.staffId,
              eligible: true,
              issued: false,
              alreadyIssued: true,
              reason: "Sertifikat sudah terbit.",
              certificateNumber: mine.certificateNumber,
            });
            continue;
          }
          // Otherwise it was a certificateNumber collision — retry the loop.
          continue;
        }
        logServerError("certificate-issuance.create", e);
        throw e;
      }
    }
    if (!created) {
      notEligible += 1;
      results.push({
        staffId: p.staffId,
        eligible: true,
        issued: false,
        alreadyIssued: false,
        reason: "Gagal mengalokasikan nomor unik (coba lagi).",
      });
    }
  }

  // Audit trail (best-effort, never throws into the request path).
  if (issued > 0) {
    await logAudit({
      userId: opts.actorUserId ?? null,
      module: "diklat",
      resource: "certificate",
      resourceId: trainingId,
      action: "CERTIFICATE_ISSUED",
      after: {
        trigger: opts.trigger,
        issued,
        trainingId,
        staffIds: results.filter((r) => r.issued).map((r) => r.staffId),
      },
    });
  }

  return { processed: scoped.length, issued, alreadyIssued, notEligible, results };
}

/**
 * Best-effort in-app notification that a certificate is ready. Marks the
 * participant notified so retries do not spam. Returns false when no channel
 * is available (only in-app notifications exist — never claim email).
 */
export async function notifyCertificateReady(
  trainingTitle: string,
  staffId: string,
): Promise<boolean> {
  try {
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { userId: true },
    });
    if (!staff?.userId) return false;
    await prisma.notification.create({
      data: {
        userId: staff.userId,
        type: "CERTIFICATE_ISSUED",
        title: "Sertifikat diterbitkan",
        message: `Sertifikat untuk kegiatan "${trainingTitle}" telah terbit.`,
        link: "/diklat/certificates",
      },
    });
    return true;
  } catch (e) {
    logServerError("certificate-issuance.notify", e);
    return false;
  }
}

/**
 * Evaluates the certificate policy for EVERY participant of an activity,
 * returning a map `staffId → { eligible, reason }`. This is the shared
 * eligibility check used by document-production paths (e.g. the .pptx
 * generator) so they enforce the SAME rule as issuance — no duplicated policy.
 *
 * Returns `cancelled: true` when the activity is CANCELLED (nobody is eligible).
 */
export async function evaluateTrainingEligibility(trainingId: string): Promise<{
  cancelled: boolean;
  eligibleByStaff: Map<string, { eligible: boolean; reason: string }>;
}> {
  const { training, participants, attendance, assessments } = await loadProgress(trainingId);
  if (!training) return { cancelled: false, eligibleByStaff: new Map() };

  const cancelled = training.status === "CANCELLED";
  const policy: CertificatePolicy = normalizePolicy(training);
  const eligibleByStaff = new Map<string, { eligible: boolean; reason: string }>();

  for (const p of participants) {
    if (cancelled) {
      eligibleByStaff.set(p.staffId, {
        eligible: false,
        reason: "Kegiatan dibatalkan (CANCELLED).",
      });
      continue;
    }
    const progress = progressFor(p.staffId, attendance, assessments, p.status === "CANCELLED");
    eligibleByStaff.set(p.staffId, evaluateEligibility(policy, progress));
  }

  return { cancelled, eligibleByStaff };
}
