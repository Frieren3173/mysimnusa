import { requireMigrationUser } from "@/lib/migration/auth";
import { ok, err } from "@/lib/api";
import { getConnectionsPublic, isGoogleConfigured } from "@/lib/google/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const [connections, batches] = await Promise.all([
    getConnectionsPublic(),
    prisma.migrationBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, sourceType: true, status: true, createdAt: true, sourceCount: true, createdCount: true },
    }),
  ]);

  // `connection` is kept for backward compatibility with earlier UI builds.
  return ok({
    configured: isGoogleConfigured(),
    connections,
    connection: connections.destination,
    source: connections.source,
    destination: connections.destination,
    recentBatches: batches,
  });
}
