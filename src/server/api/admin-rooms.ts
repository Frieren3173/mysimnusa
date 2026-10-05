import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody, paginate } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { ROOM_TYPES } from "@/lib/master-data";
import { logAudit, clientIp } from "@/lib/audit";

const BodySchema = z.object({
  name: z.string().trim().min(1, "Nama ruangan wajib diisi").max(100),
  code: z.string().trim().max(20).optional().nullable().transform((v) => (v ? v : null)),
  type: z.enum(ROOM_TYPES).optional(),
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
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = Math.min(100, Number(url.searchParams.get("perPage")) || 20);
  const q = url.searchParams.get("q")?.trim();
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  const where = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { code: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(status === "active" ? { isActive: true } : {}),
    ...(status === "inactive" ? { isActive: false } : {}),
    ...(type ? { type } : {}),
  };

  const [total, rooms] = await Promise.all([
    prisma.room.count({ where }),
    prisma.room.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { _count: { select: { nursingActions: true, borangEntries: true } } },
    }),
  ]);

  return ok(paginate(rooms, total, { page, perPage, sortOrder: "asc" }));
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(BodySchema, body);
  if (error) return error;

  const duplicate = await prisma.room.findFirst({
    where: {
      OR: [
        { name: { equals: data.name } },
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

  const autoCode =
    data.code ??
    (data.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8) || null);

  try {
    const room = await prisma.room.create({
      data: {
        name: data.name,
        code: autoCode,
        type: data.type ?? null,
        description: data.description ?? null,
        isActive: data.isActive ?? true,
      },
    });
    await logAudit({
      userId: user.id,
      module: "admin",
      resource: "room",
      resourceId: room.id,
      action: "CREATED",
      after: { name: room.name, code: room.code, type: room.type },
      ipAddress: clientIp(req),
    });
    return ok({ room });
  } catch (e) {
    return err("CREATE_FAILED", e instanceof Error ? e.message : "Gagal menyimpan ruangan", 500);
  }
}
