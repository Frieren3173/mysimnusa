import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { batchId } = await params;
  const batch = await prisma.migrationBatch.findUnique({
    where: { id: batchId },
    include: {
      fieldMappings: { orderBy: { sourceField: "asc" } },
      reconciliation: true,
      createdByUser: { select: { username: true } },
    },
  });
  if (!batch) return err("NOT_FOUND", "Batch tidak ditemukan", 404);

  const items = await prisma.migrationItem.groupBy({
    by: ["status"],
    where: { batchId },
    _count: true,
  });
  const itemCounts = Object.fromEntries(items.map((i) => [i.status, i._count]));

  return ok({ batch, itemCounts });
}
