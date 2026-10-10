import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { evaluateTrainingEligibility } from "@/lib/diklat/certificate-issuance";
import { logAudit, clientIp } from "@/lib/audit";
import { contentDisposition } from "@/lib/file-type";
import { logServerError, safeErrorMessage } from "@/lib/logger";
import {
  buildCertificateNumber,
  DEFAULT_NUMBER_PATTERN,
  DEFAULT_NUMBER_PREFIX,
  KEPALA_SEKSI,
  renderCertificatePptx,
  safeFileName,
  templateExists,
  type CertificateData,
} from "@/lib/diklat/certificate";

const GenerateSchema = z.object({
  // Hard cap on participants per batch: bounds CPU (PPTX render per person) and
  // the size of the generated ZIP.
  staffIds: z.array(z.string().min(1)).min(1, "Pilih minimal satu peserta").max(200, "Maksimal 200 peserta per batch"),
  mode: z.enum(["single", "zip"]).default("zip"),
  // Activity data
  tema: z.string().trim().min(1, "Tema wajib diisi").max(300),
  tanggal: z.coerce.date(),
  tempat: z.string().trim().min(1, "Tempat wajib diisi").max(200),
  jpl: z.coerce.number().int().min(1, "JPL minimal 1").max(999),
  // Signature (right side / Kepala Bagian Diklat) — optional
  kepalaDiklatNama: z.string().trim().max(150).optional().nullable(),
  kepalaDiklatNip: z.string().trim().max(40).optional().nullable(),
  // Configurable number format
  numberPattern: z.string().trim().max(120).optional(),
  numberPrefix: z.string().trim().max(80).optional(),
});

function numberSafeName(s: string): string {
  return safeFileName(s);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_CERTIFICATE_ISSUE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses menerbitkan sertifikat", 403);

  const { id } = await params;
  const training = await prisma.training.findUnique({ where: { id }, select: { id: true, title: true, showScore: true, status: true } });
  if (!training) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);
  // A CANCELLED activity must never issue certificates (all issue paths).
  if (training.status === "CANCELLED") {
    return err("TRAINING_CANCELLED", "Kegiatan dibatalkan — sertifikat tidak dapat dibuat.", 409);
  }
  if (!templateExists()) return err("TEMPLATE_MISSING", "Template sertifikat belum tersedia", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(GenerateSchema, body);
  if (error) return error;

  // Only participants of this training can receive a certificate.
  const participants = await prisma.trainingParticipant.findMany({
    where: { trainingId: id, staffId: { in: data.staffIds } },
    include: { staff: { select: { id: true, name: true, nip: true, profession: true } } },
  });
  if (participants.length !== new Set(data.staffIds).size) {
    return err("NOT_PARTICIPANT", "Ada peserta yang bukan bagian dari pelatihan ini", 422);
  }

  // Enforce the SAME eligibility policy as issuance (≥1 HADIR attendance in all
  // modes; test/min-score per the activity config). The legacy percentage gate
  // (`minAttendanceRate`) no longer applies. The .pptx generator must not be a
  // policy bypass.
  const { cancelled, eligibleByStaff } = await evaluateTrainingEligibility(id);
  if (cancelled) {
    return err("TRAINING_CANCELLED", "Kegiatan dibatalkan — sertifikat tidak dapat dibuat.", 409);
  }
  const ineligible = data.staffIds.filter((sid) => !eligibleByStaff.get(sid)?.eligible);
  if (ineligible.length > 0) {
    return err(
      "NOT_ELIGIBLE",
      `${ineligible.length} peserta belum memenuhi syarat sertifikat (kehadiran/tes/nilai).`,
      422,
      { staffIds: ineligible },
    );
  }

  // Scores are included on the certificate ONLY when the activity allows it.
  const assessments = training.showScore
    ? await prisma.trainingAssessment.findMany({
        where: { trainingId: id, staffId: { in: data.staffIds } },
        select: { staffId: true, score: true },
      })
    : [];
  const scoreByStaff = new Map(
    assessments.map((a) => [a.staffId, a.score != null ? Number(a.score) : null]),
  );

  const pattern = data.numberPattern || DEFAULT_NUMBER_PATTERN;
  const prefix = data.numberPrefix || DEFAULT_NUMBER_PREFIX;

  // Existing certificates for this training (reuse the number per participant).
  const existing = await prisma.certificate.findMany({
    where: { trainingId: id, staffId: { in: data.staffIds } },
  });
  const existingByStaff = new Map(existing.map((c) => [c.staffId, c]));

  // ── Global-safe number allocation ─────────────────────────────────────────
  // `certificateNumber` is UNIQUE GLOBALLY, so the next sequence must consider
  // EVERY certificate (not just this activity's), otherwise two activities with
  // the same prefix/month/year collide.
  const seqRe = /(\d+)\s*\/\s*[IVX]+\s*\/\s*\d{4}\s*$/;
  async function globalMaxSeq(): Promise<number> {
    const all = await prisma.certificate.findMany({ select: { certificateNumber: true } });
    return all.reduce((max, c) => {
      const m = c.certificateNumber.match(seqRe);
      const n = m ? Number(m[1]) : 0;
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
  }

  const ordered = data.staffIds.map((sid) => participants.find((p) => p.staff.id === sid)!).filter(Boolean);

  const issuedAt = new Date();
  const assigned: { staff: (typeof ordered)[number]["staff"]; noSert: string; certId?: string }[] = [];

  for (const p of ordered) {
    const prior = existingByStaff.get(p.staff.id);
    if (prior) {
      assigned.push({ staff: p.staff, noSert: prior.certificateNumber, certId: prior.id });
      continue;
    }

    // Allocate a globally-unique number and persist the row with a bounded
    // retry on P2002 (unique collision). No `skipDuplicates` — a failure is a
    // real failure, never a silent success.
    let persisted = false;
    let lastError: unknown = null;
    const MAX_ATTEMPTS = 12;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !persisted; attempt++) {
      const base = await globalMaxSeq();
      let candidate = "";
      for (let s = base + 1; s <= base + 1000; s++) {
        candidate = buildCertificateNumber(pattern, { prefix, seq: s, date: data.tanggal });
        const taken = await prisma.certificate.findUnique({
          where: { certificateNumber: candidate },
          select: { id: true },
        });
        if (!taken) break;
      }
      try {
        const cert = await prisma.certificate.create({
          data: {
            trainingId: id,
            staffId: p.staff.id,
            certificateNumber: candidate,
            issuedDate: issuedAt,
            issuedById: user.id,
            trigger: "MANUAL",
          },
        });
        assigned.push({ staff: p.staff, noSert: candidate, certId: cert.id });
        persisted = true;
      } catch (e) {
        lastError = e;
        // P2002 can be a number collision (retry) OR an existing
        // (training,staff) row created by a concurrent run (idempotent stop).
        if ((e as { code?: string })?.code === "P2002") {
          const winner = await prisma.certificate.findFirst({
            where: { trainingId: id, staffId: p.staff.id },
            select: { id: true, certificateNumber: true },
          });
          if (winner) {
            assigned.push({ staff: p.staff, noSert: winner.certificateNumber, certId: winner.id });
            persisted = true;
          }
          continue;
        }
        break;
      }
    }
    if (!persisted) {
      logServerError("diklat.certificates.generate.allocate", lastError);
      return err(
        "ISSUE_FAILED",
        "Gagal menerbitkan nomor sertifikat unik untuk sebagian peserta. Coba lagi.",
        409,
      );
    }
  }

  const buildData = (a: (typeof assigned)[number]): CertificateData => ({
    nama: a.staff.name,
    tema: data.tema,
    tanggal: data.tanggal,
    tempat: data.tempat,
    jpl: data.jpl,
    noSertifikat: a.noSert,
    kepalaSeksiNama: KEPALA_SEKSI.name,
    kepalaSeksiNip: KEPALA_SEKSI.nip,
    kepalaDiklatNama: data.kepalaDiklatNama ?? undefined,
    kepalaDiklatNip: data.kepalaDiklatNip ?? undefined,
    // Score included only when the activity policy allows it.
    nilai: training.showScore
      ? (scoreByStaff.get(a.staff.id) != null ? String(scoreByStaff.get(a.staff.id)) : "")
      : undefined,
  });

  try {
    if (data.mode === "single" && assigned.length === 1) {
      const pptx = await renderCertificatePptx(buildData(assigned[0]));
      await logAudit({
        userId: user.id,
        module: "diklat",
        resource: "certificate",
        resourceId: id,
        action: "CREATED",
        after: { staffId: assigned[0].staff.id, noSert: assigned[0].noSert },
        ipAddress: clientIp(req),
      });
      const fname = `Sertifikat_${numberSafeName(assigned[0].staff.name)}.pptx`;
      return new NextResponse(new Uint8Array(pptx), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": contentDisposition("attachment", fname),
          "X-Content-Type-Options": "nosniff",
          "Content-Length": String(pptx.byteLength),
        },
      });
    }

    // ZIP of all certificates.
    const zip = new JSZip();
    const used = new Set<string>();
    for (let i = 0; i < assigned.length; i++) {
      const pptx = await renderCertificatePptx(buildData(assigned[i]));
      let base = `${String(i + 1).padStart(3, "0")}_${numberSafeName(assigned[i].staff.name)}`;
      if (used.has(base)) base = `${base}_${i + 1}`;
      used.add(base);
      zip.file(`${base}.pptx`, pptx);
    }
    const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "certificate",
      resourceId: id,
      action: "CREATED",
      after: { count: assigned.length, trainingId: id },
      ipAddress: clientIp(req),
    });

    return new NextResponse(new Uint8Array(zipBuf), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition(
          "attachment",
          `Sertifikat_IHT_${numberSafeName(training.title)}.zip`,
        ),
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(zipBuf.byteLength),
      },
    });
  } catch (e) {
    logServerError("diklat.certificates.generate", e);
    return err("GENERATE_FAILED", safeErrorMessage("GENERATE_FAILED"), 500);
  }
}


