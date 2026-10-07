import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody, paginate } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { NURSING_ACTION_CATEGORIES } from "@/lib/master-data";
import { logAudit, clientIp } from "@/lib/audit";
import { logServerError, safeErrorMessage } from "@/lib/logger";

const BodySchema = z.object({
  code: z.string().trim().min(1, "Kode tindakan wajib diisi").max(30),
  name: z.string().trim().min(1, "Nama tindakan wajib diisi").max(150),
  category: z.enum(NURSING_ACTION_CATEGORIES, { message: "Kategori tidak dikenal" }),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.BORANG_LOGBOOK_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId");
  const q = url.searchParams.get("q")?.trim();
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");
  const all = url.searchParams.get("all") === "1";
  const page = all ? 1 : Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = all
    ? 500
    : roomId
      ? 500
      : Math.min(100, Number(url.searchParams.get("perPage")) || 20);

  const where = {
    ...(q
      ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] }
      : {}),
    ...(category ? { category } : {}),
    ...(status === "active" ? { isActive: true } : {}),
    ...(status === "inactive" ? { isActive: false } : {}),
    ...(roomId ? { rooms: { some: { roomId } } } : {}),
  };

  const actionWhere = roomId ? { ...where, isActive: true } : where;

  const [total, actions] = await Promise.all([
    prisma.nursingAction.count({ where: actionWhere }),
    prisma.nursingAction.findMany({
      where: actionWhere,
      orderBy: [{ category: "asc" }, { name: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        rooms: {
          include: {
            room: { select: { id: true, name: true, category: true, subcategory: true } },
          },
        },
      },
    }),
  ]);

  // Flatten the room relation for the client table (RUANGAN column).
  const data = actions.map((a) => {
    const rooms = a.rooms.map((r) => r.room);
    const { rooms: _rooms, ...rest } = a;
    void _rooms;
    return { ...rest, rooms };
  });

  return ok(paginate(data, total, { page, perPage, sortOrder: "asc" }));
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(BodySchema, body);
  if (error) return error;

  const duplicate = await prisma.nursingAction.findFirst({
    where: { OR: [{ code: { equals: data.code } }, { name: { equals: data.name } }] },
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
    const action = await prisma.nursingAction.create({
      data: {
        code: data.code,
        name: data.name,
        category: data.category,
        description: data.description ?? null,
        isActive: data.isActive ?? true,
      },
    });
    await logAudit({
      userId: user.id,
      module: "borang",
      resource: "nursing_action",
      resourceId: action.id,
      action: "CREATED",
      after: { code: action.code, name: action.name, category: action.category },
      ipAddress: clientIp(req),
    });
    return ok({ action });
  } catch (e) {
    logServerError("borang-actions", e);
    return err("CREATE_FAILED", safeErrorMessage("CREATE_FAILED"), 500);
  }
}
