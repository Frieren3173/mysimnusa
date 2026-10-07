import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { StaffSchema } from "@/lib/schemas/staff";
import { logAudit, clientIp } from "@/lib/audit";
import { logServerError, safeErrorMessage } from "@/lib/logger";

async function guard(permission: string) {
  const { authorized, user } = await checkPermission(permission);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(PERMISSIONS.KOMITE_STAFF_READ);
  if (denied) return denied;

  const { id } = await params;
  const staff = await prisma.staff.findUnique({
    where: { id },
    include: {
      room: true,
      employment: true,
      education: true,
      competencies: { include: { competency: true } },
      documents: { include: { documentType: true } },
    },
  });
  if (!staff) return err("NOT_FOUND", "Data tidak ditemukan", 404);
  return ok({ staff });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.KOMITE_STAFF_UPDATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const existing = await prisma.staff.findUnique({ where: { id } });
  if (!existing) return err("NOT_FOUND", "Data tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(StaffSchema.partial(), body);
  if (error) return error;

  if (data.nip && data.nip !== existing.nip) {
    const dup = await prisma.staff.findUnique({ where: { nip: data.nip } });
    if (dup) {
      return err("DUPLICATE_NIP", `NIP sudah terdaftar atas nama "${dup.name}"`, 409, {
        nip: ["NIP sudah digunakan"],
      });
    }
  }

  try {
    const staff = await prisma.$transaction(async (tx) => {
      const updated = await tx.staff.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.nip !== undefined ? { nip: data.nip } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.address !== undefined ? { address: data.address } : {}),
          ...(data.dateOfBirth !== undefined ? { dateOfBirth: data.dateOfBirth } : {}),
          ...(data.profession !== undefined ? { profession: data.profession } : {}),
          ...(data.roomId !== undefined ? { roomId: data.roomId || null } : {}),
          ...(data.employmentStatus !== undefined
            ? { employmentStatus: data.employmentStatus }
            : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });

      if (data.education) {
        await tx.staffEducation.deleteMany({ where: { staffId: id } });
        if (data.education.length > 0) {
          await tx.staffEducation.createMany({
            data: data.education.map((e) => ({
              staffId: id,
              level: e.level,
              institution: e.institution,
              major: e.major,
              graduationYear: e.graduationYear ?? null,
            })),
          });
        }
      }

      if (data.competencies) {
        await tx.staffCompetency.deleteMany({ where: { staffId: id } });
        for (const code of data.competencies) {
          const competency = await tx.competency.upsert({
            where: { code },
            update: {},
            create: { code, name: code.charAt(0) + code.slice(1).toLowerCase() },
          });
          await tx.staffCompetency.create({
            data: { staffId: id, competencyId: competency.id },
          });
        }
      }

      return updated;
    });

    await logAudit({
      userId: user.id,
      module: "komite",
      resource: "staff",
      resourceId: id,
      action: "UPDATED",
      before: { name: existing.name, nip: existing.nip, profession: existing.profession },
      after: {
        name: data.name ?? existing.name,
        nip: data.nip !== undefined ? data.nip : existing.nip,
        profession: data.profession ?? existing.profession,
      },
      ipAddress: clientIp(req),
    });
    return ok({ staff });
  } catch (e) {
    logServerError("komite-staff-$id$", e);
    return err("UPDATE_FAILED", safeErrorMessage("UPDATE_FAILED"), 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.KOMITE_STAFF_DELETE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const existing = await prisma.staff.findUnique({
    where: { id },
    include: { _count: { select: { borangEntries: true, trainingParticipants: true } } },
  });
  if (!existing) return err("NOT_FOUND", "Data tidak ditemukan", 404);

  if (existing._count.borangEntries > 0 || existing._count.trainingParticipants > 0) {
    return err(
      "HAS_DEPENDENCIES",
      "Data memiliki riwayat borang/pelatihan dan tidak dapat dihapus. Nonaktifkan saja.",
      409
    );
  }

  try {
    await prisma.staff.delete({ where: { id } });
    await logAudit({
      userId: user.id,
      module: "komite",
      resource: "staff",
      resourceId: id,
      action: "DELETED",
      before: { name: existing.name, nip: existing.nip },
      ipAddress: clientIp(_req),
    });
    return ok({ deleted: true });
  } catch {
    return err("DELETE_FAILED", "Gagal menghapus data (masih memiliki relasi)", 409);
  }
}
