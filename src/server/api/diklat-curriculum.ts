import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody, paginate } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { logServerError, safeErrorMessage } from "@/lib/logger";
import { CURRICULUM_STATUSES } from "@/lib/diklat/shared";

/**
 * GET  /api/diklat/curriculum?year=YYYY[&status=]  — list programs (+ item counts)
 * POST /api/diklat/curriculum                       — create a program (JSON)
 *
 * Curriculum management requires `diklat.training.create` (same authority as
 * creating activities). Reading requires `diklat.training.read`.
 * The document upload is handled by the dedicated `/curriculum/:id/document`
 * route (additive; keeps this route simple).
 */
const CreateSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  name: z.string().trim().min(1, "Nama program wajib diisi").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(CURRICULUM_STATUSES).default("DIRANCANG"),
});

export async function GET(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const url = new URL(req.url);
  const yearRaw = url.searchParams.get("year");
  const year = yearRaw ? Number(yearRaw) : null;
  const status = url.searchParams.get("status")?.trim() || null;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = Math.min(100, Number(url.searchParams.get("perPage")) || 20);

  const where = {
    ...(year ? { year } : {}),
    ...(status ? { status } : {}),
  };

  try {
    const [total, data] = await Promise.all([
      prisma.curriculumProgram.count({ where }),
      prisma.curriculumProgram.findMany({
        where,
        orderBy: [{ year: "desc" }, { name: "asc" }],
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          _count: { select: { items: true } },
          items: { select: { status: true } },
        },
      }),
    ]);
    const programs = data.map((p) => ({
      id: p.id,
      year: p.year,
      name: p.name,
      description: p.description,
      status: p.status,
      hasDocument: Boolean(p.documentStorageKey),
      documentName: p.documentName,
      itemCount: p._count.items,
      itemStatuses: p.items.map((i) => i.status),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
    return ok(paginate(programs, total, { page, perPage, sortOrder: "desc" }));
  } catch (e) {
    logServerError("diklat.curriculum", e);
    return err("LOAD_FAILED", safeErrorMessage("LOAD_FAILED"), 500);
  }
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_CREATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(CreateSchema, body);
  if (error) return error;

  try {
    const program = await prisma.curriculumProgram.create({
      data: {
        year: data.year,
        name: data.name,
        description: data.description ?? null,
        status: data.status,
        createdBy: user.id,
      },
    });
    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "curriculum_program",
      resourceId: program.id,
      action: "CREATED",
      after: { year: program.year, name: program.name },
      ipAddress: clientIp(req),
    });
    return ok({ program });
  } catch (e) {
    logServerError("diklat.curriculum.create", e);
    return err("CREATE_FAILED", safeErrorMessage("CREATE_FAILED"), 500);
  }
}
