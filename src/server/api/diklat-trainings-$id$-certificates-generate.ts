import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { contentDisposition } from "@/lib/file-type";
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
  staffIds: z.array(z.string().min(1)).min(1, "Pilih minimal satu peserta"),
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
  const training = await prisma.training.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!training) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);
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

  const pattern = data.numberPattern || DEFAULT_NUMBER_PATTERN;
  const prefix = data.numberPrefix || DEFAULT_NUMBER_PREFIX;

  // Existing certificates for this training (keeps numbering stable + unique).
  const existing = await prisma.certificate.findMany({
    where: { trainingId: id, staffId: { in: data.staffIds } },
  });
  const existingByStaff = new Map(existing.map((c) => [c.staffId, c]));

  // Next sequence = highest existing numeric suffix in this training + 1.
  const allNumbers = await prisma.certificate.findMany({
    where: { trainingId: id },
    select: { certificateNumber: true },
  });
  const maxSeq = allNumbers.reduce((max, c) => {
    const m = c.certificateNumber.match(/(\d+)\s*\/\s*[IVX]+\s*\/\s*\d{4}\s*$/);
    const n = m ? Number(m[1]) : 0;
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  const ordered = data.staffIds.map((sid) => participants.find((p) => p.staff.id === sid)!).filter(Boolean);

  // Assign numbers (reuse existing per staff; else allocate next sequence).
  const assigned: { staff: (typeof ordered)[number]["staff"]; noSert: string }[] = [];
  let seq = maxSeq;
  const usedNumbers = new Set(allNumbers.map((c) => c.certificateNumber));
  for (const p of ordered) {
    const prior = existingByStaff.get(p.staff.id);
    if (prior) {
      assigned.push({ staff: p.staff, noSert: prior.certificateNumber });
      continue;
    }
    let candidate = "";
    do {
      seq += 1;
      candidate = buildCertificateNumber(pattern, { prefix, seq, date: data.tanggal });
    } while (usedNumbers.has(candidate));
    usedNumbers.add(candidate);
    assigned.push({ staff: p.staff, noSert: candidate });
  }

  // Persist Certificate rows for the newly-issued ones (audit + traceability).
  const newlyCreated = assigned.filter((a) => !existingByStaff.has(a.staff.id));
  if (newlyCreated.length > 0) {
    await prisma.certificate.createMany({
      data: newlyCreated.map((a) => ({
        trainingId: id,
        staffId: a.staff.id,
        certificateNumber: a.noSert,
        issuedDate: data.tanggal,
      })),
      skipDuplicates: true,
    });
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
    return err("GENERATE_FAILED", e instanceof Error ? e.message : "Gagal membuat sertifikat", 500);
  }
}


