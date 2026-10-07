import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { NURSING_ACTION_CATEGORIES } from "@/lib/master-data";
import { logAudit, clientIp } from "@/lib/audit";
import { logServerError, safeErrorMessage } from "@/lib/logger";

const PatchSchema = z.object({
  code: z.string().trim().min(1, "Kode tindakan wajib diisi").max(30).optional(),
  name: z.string().trim().min(1, "Nama tindakan wajib diisi").max(150).optional(),
  category: z.enum(NURSING_ACTION_CATEGORIES, { message: "Kategori tidak dikenal" }).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const action = await prisma.nursingAction.findUnique({ where: { id } });
  if (!action) return err("NOT_FOUND", "Tindakan tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(PatchSchema, body);
  if (error) return error;

  const duplicate = await prisma.nursingAction.findFirst({
    where: {
      id: { not: id },
      OR: [
        ...(data.code ? [{ code: { equals: data.code } }] : []),
        ...(data.name ? [{ name: { equals: data.name } }] : []),
      ],
    },
  });
  if (duplicate) {
    return err(
      "DUPLICATE",
      duplicate.code === data.code
        ? `Kode "${data.code}" sudah dipakai tindakan lain`
        : `Tindakan "${data.name}" sudah ada`,
      409
    );
  }

  try {
    const updated = await prisma.nursingAction.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    await logAudit({
      userId: user.id,
      module: "borang",
      resource: "nursing_action",
      resourceId: id,
      action: "UPDATED",
      before: { code: action.code, name: action.name, isActive: action.isActive },
      after: { code: updated.code, name: updated.name, isActive: updated.isActive },
      ipAddress: clientIp(req),
    });

    return ok({ action: updated });
  } catch (e) {
    logServerError("borang-actions-$id$", e);
    return err("UPDATE_FAILED", safeErrorMessage("UPDATE_FAILED"), 500);
  }
}
