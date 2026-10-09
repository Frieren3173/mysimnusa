import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody, paginate } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { logServerError, safeErrorMessage } from "@/lib/logger";

const CreateSchema = z.object({
  title: z.string().trim().min(1, "Judul wajib diisi").max(200),
  category: z.string().trim().max(100).optional().transform((v) => (v ? v : null)),
  description: z.string().trim().max(2000).optional().transform((v) => (v ? v : null)),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  location: z.string().trim().max(200).optional().transform((v) => (v ? v : null)),
  capacity: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "ONGOING", "COMPLETED", "CANCELLED"]).default("DRAFT"),
  /// JPL credited per eligible participant. Optional; must be a non-negative int.
  jpl: z.coerce.number().int().min(0).max(999).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = Math.min(100, Number(url.searchParams.get("perPage")) || 20);
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search")?.trim();

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(search
      ? { OR: [{ title: { contains: search, mode: "insensitive" as const } }, { category: { contains: search, mode: "insensitive" as const } }, { location: { contains: search, mode: "insensitive" as const } }] }
      : {}),
  };

  const [total, data] = await Promise.all([
    prisma.training.count({ where }),
    prisma.training.findMany({
      where,
      include: {
        _count: { select: { participants: true, certificates: true, attendance: true } },
        instructors: true,
      },
      orderBy: { startDate: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  return ok(paginate(data, total, { page, perPage, sortOrder: "desc" }));
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_CREATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(CreateSchema, body);
  if (error) return error;
  if (data.endDate < data.startDate) {
    return err("INVALID_RANGE", "Tanggal selesai tidak boleh sebelum tanggal mulai", 422, {
      endDate: ["Tanggal selesai sebelum tanggal mulai"],
    });
  }

  try {
    const training = await prisma.training.create({
      data: { ...data, createdBy: user.id },
    });
    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "training",
      resourceId: training.id,
      action: "CREATED",
      after: { title: training.title, startDate: training.startDate },
      ipAddress: clientIp(req),
    });
    return ok({ training });
  } catch (e) {
    logServerError("diklat-trainings", e);
    return err("CREATE_FAILED", safeErrorMessage("CREATE_FAILED"), 500);
  }
}
