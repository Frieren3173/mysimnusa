import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { dryRunBatch } from "@/lib/migration/engine";

export async function POST(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { batchId } = await params;
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } });
  if (!batch) return err("NOT_FOUND", "Batch tidak ditemukan", 404);
  if (batch.status !== "READY") {
    return err("INVALID_STATUS", "Jalankan validasi terlebih dahulu sebelum dry run", 409);
  }

  try {
    const result = await dryRunBatch(batchId);
    return ok(result);
  } catch (e) {
    return err("DRY_RUN_FAILED", e instanceof Error ? e.message : "Dry run gagal", 500);
  }
}
