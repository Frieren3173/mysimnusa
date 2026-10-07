import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody, PaginationSchema, paginate } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { USER_API_SELECT } from "@/lib/user-select";
import { logServerError, safeErrorMessage } from "@/lib/logger";

const select = USER_API_SELECT;

const CreateSchema = z.object({
  username: z.string().trim().min(3, "Username minimal 3 karakter").max(50),
  email: z.string().trim().email("Email tidak valid").max(200),
  password: z.string().min(8, "Password minimal 8 karakter").max(200),
  isActive: z.boolean().default(true),
  roles: z.array(z.string()).default([]),
});

export async function GET(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_USERS_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const url = new URL(req.url);
  const parsed = PaginationSchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    perPage: url.searchParams.get("perPage") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  });
  const params = parsed.success
    ? parsed.data
    : { page: 1, perPage: 20, sortOrder: "asc" as const };

  const search = typeof params.search === "string" ? params.search.trim() : "";
  const where = search
    ? {
        OR: [
          { username: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { staff: { name: { contains: search, mode: "insensitive" as const } } },
        ],
      }
    : undefined;

  const [total, users, roles] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select,
      orderBy: { username: "asc" },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  return ok({ ...paginate(users, total, { ...params, sortOrder: "asc" }), roles });
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_USERS_CREATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(CreateSchema, body);
  if (error) return error;

  const dup = await prisma.user.findFirst({
    where: { OR: [{ username: data.username }, { email: data.email }] },
  });
  if (dup) {
    const field = dup.username === data.username ? "username" : "email";
    return err("DUPLICATE", `${field} sudah digunakan`, 409, {
      [field]: [`${field} sudah digunakan`],
    });
  }

  try {
    const passwordHash = await bcrypt.hash(data.password, 12);
    const created = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username: data.username,
          email: data.email,
          passwordHash,
          isActive: data.isActive,
        },
      });
      for (const roleName of data.roles) {
        const role = await tx.role.findUnique({ where: { name: roleName } });
        if (role) {
          await tx.userRole.create({ data: { userId: u.id, roleId: role.id } });
        }
      }
      return u;
    });

    await logAudit({
      userId: user.id,
      module: "admin",
      resource: "user",
      resourceId: created.id,
      action: "CREATED",
      after: { username: data.username, email: data.email, roles: data.roles },
      ipAddress: clientIp(req),
    });

    const full = await prisma.user.findUnique({ where: { id: created.id }, select });
    return ok({ user: full });
  } catch (e) {
    logServerError("admin-users", e);
    return err("CREATE_FAILED", safeErrorMessage("CREATE_FAILED"), 500);
  }
}
