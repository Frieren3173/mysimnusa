import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { CURRICULUM_STATUSES } from "@/lib/diklat/shared";
import { logServerError, safeErrorMessage } from "@/lib/logger";

/**
 * PATCH  /api/diklat/curriculum/items/:itemId — update a planned item
 *        (title, target dates, status, and the realising training link).
 * DELETE /api/diklat/curriculum/items/:itemId — remove a planned item
 *        (linked trainings keep existing; their curriculumItemId is SET NULL).
 */
const UpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  targetDate: z.coerce.date().optional().nullable(),
  targetJpl: z.coerce.number().int().min(0).max(999).optional().nullable(),
  scheduledAt: z.coerce.date().optional().nullable(),
  status: z.enum(CURRICULUM_STATUSES).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_UPDATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { itemId } = await params;
  const existing = await prisma.curriculumItem.findUnique({ where: { id: itemId } });
  if (!existing) return err("NOT_FOUND", "Materi tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(UpdateSchema, body);
  if (error) return error;

  try {
    const item = await prisma.curriculumItem.update({ where: { id: itemId }, data });
    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "curriculum_item",
      resourceId: itemId,
      action: "UPDATED",
      before: { status: existing.status, title: existing.title },
      after: { status: item.status, title: item.title },
      ipAddress: clientIp(req),
    });
    return ok({ item });
  } catch (e) {
    logServerError("diklat.curriculum.item.update", e);
    return err("UPDATE_FAILED", safeErrorMessage("UPDATE_FAILED"), 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_DELETE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { itemId } = await params;
  const existing = await prisma.curriculumItem.findUnique({ where: { id: itemId } });
  if (!existing) return err("NOT_FOUND", "Materi tidak ditemukan", 404);

  try {
    await prisma.curriculumItem.delete({ where: { id: itemId } });
    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "curriculum_item",
      resourceId: itemId,
      action: "DELETED",
      before: { title: existing.title },
      ipAddress: clientIp(_req),
    });
    return ok({ deleted: true });
  } catch (e) {
    logServerError("diklat.curriculum.item.delete", e);
    return err("DELETE_FAILED", safeErrorMessage("DELETE_FAILED"), 500);
  }
}
