import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";

export async function GET() {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const batches = await prisma.migrationBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      createdByUser: { select: { username: true } },
      reconciliation: true,
      _count: { select: { items: true } },
    },
  });

  return ok({ batches });
}
