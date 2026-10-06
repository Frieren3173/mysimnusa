import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { PATIENT_CODE_RE } from "@/lib/borang";

const EditSchema = z.object({
  roomId: z.string().optional().nullable(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  patientIdentifier: z
    .string()
    .trim()
    .toUpperCase()
    .regex(PATIENT_CODE_RE, "Format TN.X, NY.X, atau BY.NY.X")
    .max(10)
    .optional(),
  actionType: z.string().trim().min(1).max(200).optional(),
  nursingActionId: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(999).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.BORANG_LOGBOOK_UPDATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const entry = await prisma.borangEntry.findUnique({ where: { id } });
  if (!entry) return err("NOT_FOUND", "Entri tidak ditemukan", 404);
  if (!["DRAFT", "REJECTED"].includes(entry.status)) {
    return err("INVALID_STATUS", "Hanya entri DRAFT/REJECTED yang dapat diubah", 409);
  }

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(EditSchema, body);
  if (error) return error;

  try {
    const updated = await prisma.borangEntry.update({
      where: { id },
      data: {
        ...(data.roomId !== undefined ? { roomId: data.roomId || null } : {}),
        ...(data.period !== undefined ? { period: data.period } : {}),
        ...(data.patientIdentifier !== undefined
          ? { patientIdentifier: data.patientIdentifier }
          : {}),
        ...(data.actionType !== undefined ? { actionType: data.actionType } : {}),
        ...(data.nursingActionId !== undefined
          ? { nursingActionId: data.nursingActionId || null }
          : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      include: {
        staff: { select: { id: true, name: true, profession: true } },
        room: { select: { name: true } },
      },
    });

    await logAudit({
      userId: user.id,
      staffId: entry.staffId,
      borangId: id,
      module: "borang",
      resource: "borang_entry",
      resourceId: id,
      action: "UPDATED",
      before: { actionType: entry.actionType, quantity: entry.quantity },
      after: { actionType: updated.actionType, quantity: updated.quantity },
      ipAddress: clientIp(req),
    });

    return ok({ entry: updated });
  } catch (e) {
    return err("UPDATE_FAILED", e instanceof Error ? e.message : "Gagal memperbarui", 500);
  }
}

/**
 * Permanently delete a Borang entry.
 *
 * Rules:
 *  - Only ARCHIVED entries may be deleted (guard rail: anything still in a live
 *    workflow must be archived first). This also protects against accidental
 *    loss of entries that are still being verified/approved.
 *  - Requires the archive-level borang permission (ADMIN_BORANG / SUPER_ADMIN).
 *
 * Relations (audited against the Prisma schema):
 *  - `BorangVerification` children have `onDelete: Cascade` → removed with the
 *    entry (they are part of the Borang itself).
 *  - `AuditLog.borangId` is a nullable FK with no cascade → its `borangId` is
 *    set to NULL, so audit *history* is preserved (never deleted).
 *  - Nothing references Staff / Room / NursingAction / Document from here, so no
 *    master data is affected.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.BORANG_LOGBOOK_ARCHIVE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses menghapus borang", 403);

  const { id } = await params;
  const entry = await prisma.borangEntry.findUnique({
    where: { id },
    select: {
      id: true,
      staffId: true,
      period: true,
      actionType: true,
      quantity: true,
      status: true,
    },
  });
  if (!entry) return err("NOT_FOUND", "Borang tidak ditemukan", 404);
  if (entry.status !== "ARCHIVED") {
    return err(
      "NOT_ARCHIVED",
      "Hanya borang berstatus Diarsipkan yang dapat dihapus.",
      409,
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Detach audit history (keep the logs, drop the FK) before deleting.
      await tx.auditLog.updateMany({
        where: { borangId: id },
        data: { borangId: null },
      });
      // BorangVerification rows cascade automatically.
      await tx.borangEntry.delete({ where: { id } });
    });

    await logAudit({
      userId: user.id,
      staffId: entry.staffId,
      module: "borang",
      resource: "borang_entry",
      resourceId: id,
      action: "DELETED",
      before: {
        period: entry.period,
        actionType: entry.actionType,
        quantity: entry.quantity,
        status: entry.status,
      },
      ipAddress: clientIp(req),
    });

    return ok({ id });
  } catch (e) {
    return err("DELETE_FAILED", e instanceof Error ? e.message : "Gagal menghapus borang", 500);
  }
}
