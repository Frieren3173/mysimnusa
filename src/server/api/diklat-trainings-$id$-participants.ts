import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { isUniqueViolationOn, isWriteConflict } from "@/lib/diklat/prisma-errors";
import { logServerError, safeErrorMessage } from "@/lib/logger";

const CreateSchema = z.object({
  staffId: z.string().min(1, "Petugas wajib dipilih"),
  status: z.enum(["REGISTERED", "CONFIRMED", "CANCELLED"]).default("REGISTERED"),
});

async function guard(permission: string) {
  const { authorized, user } = await checkPermission(permission);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(PERMISSIONS.DIKLAT_TRAINING_MANAGE_PARTICIPANTS);
  if (denied) return denied;

  const { id } = await params;
  const training = await prisma.training.findUnique({
    where: { id },
    include: {
      participants: {
        include: { staff: { select: { id: true, name: true, profession: true, nip: true } } },
        orderBy: { registeredAt: "asc" },
      },
      _count: { select: { participants: true } },
    },
  });
  if (!training) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);
  return ok({ participants: training.participants, capacity: training.capacity });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_MANAGE_PARTICIPANTS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const training = await prisma.training.findUnique({
    where: { id },
    select: { id: true, status: true, capacity: true },
  });
  if (!training) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);
  if (training.status === "CANCELLED") return err("TRAINING_CANCELLED", "Pelatihan dibatalkan", 409);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(CreateSchema, body);
  if (error) return error;

  const staff = await prisma.staff.findUnique({ where: { id: data.staffId } });
  if (!staff) return err("STAFF_NOT_FOUND", "Petugas tidak ditemukan", 404);

  try {
    // Capacity check + insert run in ONE serializable transaction so two
    // concurrent adds cannot both pass the check and exceed the quota. The
    // active count EXCLUDES CANCELLED participants (a cancelled seat frees the
    // slot).
    const participant = await prisma.$transaction(
      async (tx) => {
        if (training.capacity) {
          const activeCount = await tx.trainingParticipant.count({
            where: { trainingId: id, status: { not: "CANCELLED" } },
          });
          if (activeCount >= training.capacity) {
            throw new CapacityError();
          }
        }
        return tx.trainingParticipant.create({
          data: { trainingId: id, staffId: data.staffId, status: data.status },
          include: { staff: { select: { id: true, name: true, profession: true, nip: true } } },
        });
      },
      { isolationLevel: "Serializable" },
    );
    return ok({ participant });
  } catch (e) {
    if (e instanceof CapacityError) {
      return err("CAPACITY_FULL", "Kuota peserta penuh", 409);
    }
    // Prisma serialization failure → the check could not be atomic; ask to retry.
    if (isWriteConflict(e)) {
      return err("CONFLICT", "Kuota sedang diperbarui, coba lagi", 409);
    }
    // Unique violation ONLY on [trainingId, staffId] → already registered.
    // Any OTHER error (a different unique constraint, connection loss, …) must
    // NOT be disguised as a duplicate — surface it as a safe generic failure.
    if (isUniqueViolationOn(e, ["trainingId", "staffId"])) {
      return err("ALREADY_REGISTERED", "Petugas sudah terdaftar di pelatihan ini", 409);
    }
    logServerError("diklat.participants.add", e);
    return err("ADD_PARTICIPANT_FAILED", safeErrorMessage("ADD_PARTICIPANT_FAILED"), 500);
  }
}

/** Thrown inside the capacity transaction when the quota is full. */
class CapacityError extends Error {}
