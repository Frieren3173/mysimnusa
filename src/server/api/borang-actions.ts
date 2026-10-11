import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody, paginate } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { NURSING_ACTION_CATEGORIES } from "@/lib/master-data";
import { buildActionCode, maxActionSeq } from "@/lib/borang-action-code";
import { logAudit, clientIp } from "@/lib/audit";
import { logServerError, safeErrorMessage } from "@/lib/logger";

const BodySchema = z.object({
  // `code` is intentionally NOT accepted from the client — the system owns it.
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

  // Reject a duplicate NAME (case-insensitive). The code is generated below.
  const duplicate = await prisma.nursingAction.findFirst({
    where: { name: { equals: data.name, mode: "insensitive" } },
  });
  if (duplicate) {
    return err("DUPLICATE", `Tindakan "${data.name}" sudah ada`, 409);
  }

  // Auto-generate a unique, system-owned code. `code` is @unique, so a race
  // between two concurrent creates surfaces as P2002 → retry with the NEXT
  // sequence (monotonic, bounded). Codes are never taken from user input.
  const prefix = buildActionCode(data.category, 1).replace(/-\d+$/, "-");
  const existing = await prisma.nursingAction.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });
  let seq = maxActionSeq(existing.map((e) => e.code), data.category);
  const MAX_ATTEMPTS = 25;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    seq += 1;
    const candidate = buildActionCode(data.category, seq);
    try {
      const action = await prisma.nursingAction.create({
        data: {
          code: candidate,
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
      // Only a unique-constraint collision (P2002 on `code`) is retryable.
      if ((e as { code?: string })?.code === "P2002") continue;
      logServerError("borang-actions", e);
      return err("CREATE_FAILED", safeErrorMessage("CREATE_FAILED"), 500);
    }
  }
  return err("CODE_ALLOCATION_FAILED", "Gagal membuat kode tindakan unik. Coba lagi.", 409);
}
