import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";

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
    include: { _count: { select: { participants: true } } },
  });
  if (!training) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);
  if (training.status === "CANCELLED") return err("TRAINING_CANCELLED", "Pelatihan dibatalkan", 409);
  if (training.capacity && training._count.participants >= training.capacity) {
    return err("CAPACITY_FULL", "Kuota peserta penuh", 409);
  }

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(CreateSchema, body);
  if (error) return error;

  const staff = await prisma.staff.findUnique({ where: { id: data.staffId } });
  if (!staff) return err("STAFF_NOT_FOUND", "Petugas tidak ditemukan", 404);

  try {
    const participant = await prisma.trainingParticipant.create({
      data: { trainingId: id, staffId: data.staffId, status: data.status },
      include: { staff: { select: { id: true, name: true, profession: true, nip: true } } },
    });
    return ok({ participant });
  } catch {
    return err("ALREADY_REGISTERED", "Petugas sudah terdaftar di pelatihan ini", 409);
  }
}
