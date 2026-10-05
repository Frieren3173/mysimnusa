import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, err, paginate, PaginationSchema } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_AUDIT_READ);
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
    : { page: 1, perPage: 50, sortOrder: "desc" as const };

  const moduleName = url.searchParams.get("module");
  const action = url.searchParams.get("action");
  const search = typeof params.search === "string" ? params.search.trim() : "";

  const where = {
    ...(moduleName ? { module: moduleName } : {}),
    ...(action ? { action } : {}),
    ...(search
      ? {
          OR: [
            { resource: { contains: search, mode: "insensitive" as const } },
            { resourceId: { contains: search, mode: "insensitive" as const } },
            { user: { username: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
    }),
  ]);

  return ok(paginate(logs, total, { ...params, sortOrder: "desc" }));
}
