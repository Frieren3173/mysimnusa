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
 * GET    /api/diklat/curriculum/:id   — program detail with items + realised trainings
 * PATCH  /api/diklat/curriculum/:id   — update program
 * DELETE /api/diklat/curriculum/:id   — delete program (cascade items; trainings
 *                                        stay, their link is SET NULL)
 */
const UpdateSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(CURRICULUM_STATUSES).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  try {
    const program = await prisma.curriculumProgram.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ targetDate: "asc" }, { createdAt: "asc" }],
          include: {
            trainings: {
              select: {
                id: true,
                title: true,
                status: true,
                startDate: true,
                endDate: true,
                jpl: true,
              },
            },
          },
        },
      },
    });
    if (!program) return err("NOT_FOUND", "Program tidak ditemukan", 404);
    return ok({ program });
  } catch (e) {
    logServerError("diklat.curriculum.detail", e);
    return err("LOAD_FAILED", safeErrorMessage("LOAD_FAILED"), 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_UPDATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const existing = await prisma.curriculumProgram.findUnique({ where: { id } });
  if (!existing) return err("NOT_FOUND", "Program tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(UpdateSchema, body);
  if (error) return error;

  try {
    const program = await prisma.curriculumProgram.update({ where: { id }, data });
    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "curriculum_program",
      resourceId: id,
      action: "UPDATED",
      before: { status: existing.status, name: existing.name, year: existing.year },
      after: { status: program.status, name: program.name, year: program.year },
      ipAddress: clientIp(req),
    });
    return ok({ program });
  } catch (e) {
    logServerError("diklat.curriculum.update", e);
    return err("UPDATE_FAILED", safeErrorMessage("UPDATE_FAILED"), 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_DELETE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const existing = await prisma.curriculumProgram.findUnique({ where: { id } });
  if (!existing) return err("NOT_FOUND", "Program tidak ditemukan", 404);

  try {
    // Items cascade; trainings referencing an item have curriculumItemId set to
    // NULL (their data is preserved).
    await prisma.curriculumProgram.delete({ where: { id } });
    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "curriculum_program",
      resourceId: id,
      action: "DELETED",
      before: { name: existing.name, year: existing.year },
      ipAddress: clientIp(_req),
    });
    return ok({ deleted: true });
  } catch (e) {
    logServerError("diklat.curriculum.delete", e);
    return err("DELETE_FAILED", safeErrorMessage("DELETE_FAILED"), 500);
  }
}
