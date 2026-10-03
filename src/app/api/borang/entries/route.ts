import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody, paginate } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";

const PATIENT_ID = /^(TN|NY)\.[A-Z]$/;

const CreateSchema = z.object({
  staffId: z.string().optional(),
  roomId: z.string().optional().nullable(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Periode format YYYY-MM"),
  patientIdentifier: z
    .string()
    .trim()
    .toUpperCase()
    .regex(PATIENT_ID, "Format TN.X atau NY.X")
    .max(10),
  actionType: z.string().trim().min(1, "Tindakan wajib diisi").max(200),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  notes: z.string().trim().max(1000).optional().transform((v) => (v ? v : null)),
});

export async function GET(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.BORANG_LOGBOOK_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = Math.min(100, Number(url.searchParams.get("perPage")) || 20);
  const status = url.searchParams.get("status");
  const period = url.searchParams.get("period");
  const search = url.searchParams.get("search")?.trim();
  const mine = url.searchParams.get("mine") === "1";

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(period ? { period } : {}),
    ...(mine && user.staff?.id ? { staffId: user.staff.id } : {}),
    ...(search
      ? {
          OR: [
            { actionType: { contains: search } },
            { patientIdentifier: { contains: search } },
            { staff: { name: { contains: search } } },
          ],
        }
      : {}),
  };

  const [total, data] = await Promise.all([
    prisma.borangEntry.count({ where }),
    prisma.borangEntry.findMany({
      where,
      include: {
        staff: { select: { id: true, name: true, profession: true } },
        room: { select: { name: true } },
        verifications: { orderBy: { createdAt: "desc" }, take: 3 },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  return ok(paginate(data, total, { page, perPage, sortOrder: "desc" }));
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.BORANG_LOGBOOK_CREATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(CreateSchema, body);
  if (error) return error;

  const staffId = data.staffId ?? user.staff?.id;
  if (!staffId) {
    return err("NO_STAFF", "Akun ini tidak terhubung ke data SDM — pilih petugas", 422);
  }
  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff) return err("STAFF_NOT_FOUND", "Petugas tidak ditemukan", 404);

  try {
    const entry = await prisma.borangEntry.create({
      data: {
        staffId,
        roomId: data.roomId || null,
        period: data.period,
        patientIdentifier: data.patientIdentifier,
        actionType: data.actionType,
        quantity: data.quantity,
        notes: data.notes,
        status: "DRAFT",
      },
      include: {
        staff: { select: { id: true, name: true, profession: true } },
        room: { select: { name: true } },
      },
    });

    await logAudit({
      userId: user.id,
      staffId,
      module: "borang",
      resource: "borang_entry",
      resourceId: entry.id,
      action: "CREATED",
      after: { period: entry.period, actionType: entry.actionType, quantity: entry.quantity },
      ipAddress: clientIp(req),
    });

    return ok({ entry });
  } catch (e) {
    return err("CREATE_FAILED", e instanceof Error ? e.message : "Gagal menyimpan logbook", 500);
  }
}
