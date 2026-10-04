import { requireMigrationUser } from "@/lib/migration/auth";
import { ok, err } from "@/lib/api";
import { getConnectionPublic, isGoogleConfigured } from "@/lib/google/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const [connection, batches] = await Promise.all([
    getConnectionPublic(),
    prisma.migrationBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, sourceType: true, status: true, createdAt: true, sourceCount: true, createdCount: true },
    }),
  ]);

  return ok({
    configured: isGoogleConfigured(),
    connection,
    recentBatches: batches,
  });
}
