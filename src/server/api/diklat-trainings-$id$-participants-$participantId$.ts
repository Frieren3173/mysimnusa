import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";

const UpdateSchema = z.object({
  status: z.enum(["REGISTERED", "CONFIRMED", "CANCELLED"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_MANAGE_PARTICIPANTS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id, participantId } = await params;
  const existing = await prisma.trainingParticipant.findUnique({ where: { id: participantId } });
  if (!existing || existing.trainingId !== id) return err("NOT_FOUND", "Peserta tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(UpdateSchema, body);
  if (error) return error;

  const participant = await prisma.trainingParticipant.update({
    where: { id: participantId },
    data: { status: data.status },
    include: { staff: { select: { id: true, name: true, profession: true, nip: true } } },
  });
  return ok({ participant });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_MANAGE_PARTICIPANTS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id, participantId } = await params;
  const existing = await prisma.trainingParticipant.findUnique({ where: { id: participantId } });
  if (!existing || existing.trainingId !== id) return err("NOT_FOUND", "Peserta tidak ditemukan", 404);
  const cert = await prisma.certificate.findFirst({
    where: { trainingId: id, staffId: existing.staffId },
  });
  if (cert) {
    return err("HAS_CERTIFICATE", "Sertifikat sudah terbit — peserta tidak dapat dihapus", 409);
  }

  await prisma.trainingParticipant.delete({ where: { id: participantId } });
  return ok({ deleted: true });
}
