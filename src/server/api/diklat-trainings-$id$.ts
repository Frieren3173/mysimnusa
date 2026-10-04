import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";

const UpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  location: z.string().trim().max(200).optional().nullable(),
  capacity: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "ONGOING", "COMPLETED", "CANCELLED"]).optional(),
});

const detailInclude = {
  participants: {
    include: {
      staff: { select: { id: true, name: true, profession: true, room: { select: { name: true } } } },
    },
    orderBy: { registeredAt: "desc" as const },
  },
  attendance: true,
  assessments: true,
  certificates: true,
  instructors: true,
};

async function guard(permission: string) {
  const { authorized, user } = await checkPermission(permission);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(PERMISSIONS.DIKLAT_TRAINING_READ);
  if (denied) return denied;

  const { id } = await params;
  const training = await prisma.training.findUnique({ where: { id }, include: detailInclude });
  if (!training) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);
  return ok({ training });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_UPDATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const existing = await prisma.training.findUnique({ where: { id } });
  if (!existing) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(UpdateSchema, body);
  if (error) return error;

  try {
    const training = await prisma.training.update({ where: { id }, data });
    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "training",
      resourceId: id,
      action: "UPDATED",
      before: { status: existing.status, title: existing.title },
      after: { status: training.status, title: training.title },
      ipAddress: clientIp(req),
    });
    return ok({ training });
  } catch (e) {
    return err("UPDATE_FAILED", e instanceof Error ? e.message : "Gagal memperbarui", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_DELETE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const existing = await prisma.training.findUnique({
    where: { id },
    include: { _count: { select: { certificates: true } } },
  });
  if (!existing) return err("NOT_FOUND", "Pelatihan tidak ditemukan", 404);
  if (existing._count.certificates > 0) {
    return err(
      "HAS_CERTIFICATES",
      "Sertifikat sudah terbit — ubah status menjadi CANCELLED alih-alih menghapus.",
      409
    );
  }

  try {
    await prisma.training.delete({ where: { id } });
    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "training",
      resourceId: id,
      action: "DELETED",
      before: { title: existing.title },
      ipAddress: clientIp(_req),
    });
    return ok({ deleted: true });
  } catch {
    return err("DELETE_FAILED", "Gagal menghapus pelatihan", 500);
  }
}
