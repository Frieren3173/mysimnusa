import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { ROOM_TYPES } from "@/lib/master-data";
import { logAudit, clientIp } from "@/lib/audit";

const PatchSchema = z.object({
  name: z.string().trim().min(1, "Nama ruangan wajib diisi").max(100).optional(),
  code: z.string().trim().max(20).optional().nullable(),
  type: z.enum(ROOM_TYPES).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return err("NOT_FOUND", "Ruangan tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(PatchSchema, body);
  if (error) return error;

  const duplicate = await prisma.room.findFirst({
    where: {
      id: { not: id },
      OR: [
        ...(data.name ? [{ name: { equals: data.name } }] : []),
        ...(data.code ? [{ code: { equals: data.code } }] : []),
      ],
    },
  });
  if (duplicate) {
    return err(
      "DUPLICATE",
      duplicate.name === data.name
        ? `Ruangan "${data.name}" sudah ada`
        : `Kode "${data.code}" sudah dipakai ruangan lain`,
      409
    );
  }

  try {
    const updated = await prisma.room.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code || null } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    await logAudit({
      userId: user.id,
      module: "admin",
      resource: "room",
      resourceId: id,
      action: "UPDATED",
      before: { name: room.name, code: room.code, type: room.type, isActive: room.isActive },
      after: { name: updated.name, code: updated.code, type: updated.type, isActive: updated.isActive },
      ipAddress: clientIp(req),
    });

    return ok({ room: updated });
  } catch (e) {
    return err("UPDATE_FAILED", e instanceof Error ? e.message : "Gagal memperbarui ruangan", 500);
  }
}
