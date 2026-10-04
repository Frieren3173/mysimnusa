import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";

const UpsertSchema = z.object({
  staffId: z.string().min(1),
  date: z.coerce.date(),
  status: z.enum(["HADIR", "TIDAK_HADIR", "SAKIT", "IZIN"]),
  notes: z.string().trim().max(500).optional().nullable(),
});

async function guard(permission: string) {
  const { authorized, user } = await checkPermission(permission);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(PERMISSIONS.DIKLAT_TRAINING_MANAGE_ATTENDANCE);
  if (denied) return denied;

  const { id } = await params;
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");

  const attendance = await prisma.trainingAttendance.findMany({
    where: { trainingId: id, ...(dateParam ? { date: new Date(dateParam) } : {}) },
    orderBy: { date: "desc" },
  });
  return ok({ attendance });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_MANAGE_ATTENDANCE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const training = await prisma.training.findUnique({ where: { id } });
  if (!training) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(UpsertSchema, body);
  if (error) return error;

  const participant = await prisma.trainingParticipant.findUnique({
    where: { trainingId_staffId: { trainingId: id, staffId: data.staffId } },
  });
  if (!participant) return err("NOT_PARTICIPANT", "Petugas bukan peserta pelatihan ini", 404);

  const dayStart = new Date(data.date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const existing = await prisma.trainingAttendance.findFirst({
    where: { trainingId: id, staffId: data.staffId, date: { gte: dayStart, lt: dayEnd } },
  });

  const attendance = existing
    ? await prisma.trainingAttendance.update({
        where: { id: existing.id },
        data: { status: data.status, notes: data.notes ?? null },
      })
    : await prisma.trainingAttendance.create({
        data: {
          trainingId: id,
          staffId: data.staffId,
          date: dayStart,
          status: data.status,
          notes: data.notes ?? null,
        },
      });

  return ok({ attendance });
}
