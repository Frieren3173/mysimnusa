import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, err, paginate, PaginationSchema } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { batchId } = await params;
  const url = new URL(req.url);
  const parsed = PaginationSchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    perPage: url.searchParams.get("perPage") ?? undefined,
  });
  const page = parsed.success ? parsed.data.page : 1;
  const perPage = parsed.success ? Math.min(parsed.data.perPage, 100) : 20;
  const status = url.searchParams.get("status");

  const where = {
    batchId,
    ...(status ? { status: status as never } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.migrationItem.count({ where }),
    prisma.migrationItem.findMany({
      where,
      orderBy: { sourceId: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  return ok(paginate(items, total, { page, perPage, sortOrder: "asc" }));
}
