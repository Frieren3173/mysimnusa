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
 * POST /api/diklat/curriculum/:id/items — add a planned material/activity item.
 * GET  /api/diklat/curriculum/:id/items — list items for a program.
 */
const CreateSchema = z.object({
  title: z.string().trim().min(1, "Nama materi wajib diisi").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  targetDate: z.coerce.date().optional().nullable(),
  targetJpl: z.coerce.number().int().min(0).max(999).optional().nullable(),
  scheduledAt: z.coerce.date().optional().nullable(),
  status: z.enum(CURRICULUM_STATUSES).default("DIRANCANG"),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const items = await prisma.curriculumItem.findMany({
    where: { programId: id },
    orderBy: [{ targetDate: "asc" }, { createdAt: "asc" }],
    include: { trainings: { select: { id: true, title: true, status: true, startDate: true } } },
  });
  return ok({ items });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_CREATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const program = await prisma.curriculumProgram.findUnique({ where: { id }, select: { id: true } });
  if (!program) return err("NOT_FOUND", "Program tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(CreateSchema, body);
  if (error) return error;

  try {
    const item = await prisma.curriculumItem.create({
      data: {
        programId: id,
        title: data.title,
        description: data.description ?? null,
        targetDate: data.targetDate ?? null,
        targetJpl: data.targetJpl ?? null,
        scheduledAt: data.scheduledAt ?? null,
        status: data.status,
      },
    });
    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "curriculum_item",
      resourceId: item.id,
      action: "CREATED",
      after: { title: item.title, programId: id },
      ipAddress: clientIp(req),
    });
    return ok({ item });
  } catch (e) {
    logServerError("diklat.curriculum.items.create", e);
    return err("CREATE_FAILED", safeErrorMessage("CREATE_FAILED"), 500);
  }
}
