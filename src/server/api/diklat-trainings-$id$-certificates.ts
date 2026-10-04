import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";

const IssueSchema = z.object({
  staffId: z.string().min(1),
  certificateNumber: z.string().trim().max(80).optional().nullable(),
  issuedDate: z.coerce.date().optional(),
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
  const training = await prisma.training.findUnique({ where: { id } });
  if (!training) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(IssueSchema, body);
  if (error) return error;

  const participant = await prisma.trainingParticipant.findUnique({
    where: { trainingId_staffId: { trainingId: id, staffId: data.staffId } },
  });
  if (!participant) return err("NOT_PARTICIPANT", "Petugas bukan peserta pelatihan ini", 404);

  const dup = await prisma.certificate.findFirst({
    where: { trainingId: id, staffId: data.staffId },
  });
  if (dup) return err("ALREADY_ISSUED", "Sertifikat sudah terbit untuk peserta ini", 409);

  try {
    const count = await prisma.certificate.count({ where: { trainingId: id } });
    const num =
      data.certificateNumber?.trim() ||
      `SERT/${(training.title || "DIKLAT").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase()}/${String(count + 1).padStart(4, "0")}`;

    const certificate = await prisma.certificate.create({
      data: {
        trainingId: id,
        staffId: data.staffId,
        certificateNumber: num,
        issuedDate: data.issuedDate ?? new Date(),
      },
    });

    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "certificate",
      resourceId: certificate.id,
      action: "CREATED",
      after: { certificateNumber: num, trainingId: id },
      ipAddress: clientIp(req),
    });

    return ok({ certificate });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("Duplicate")) {
      return err("DUPLICATE_NUMBER", "Nomor sertifikat sudah dipakai", 409);
    }
    return err("ISSUE_FAILED", "Gagal menerbitkan sertifikat", 500);
  }
}
