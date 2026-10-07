import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { retryFailedItems } from "@/lib/migration/engine";
import { logServerError, safeErrorMessage } from "@/lib/logger";

export async function POST(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { batchId } = await params;
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } });
  if (!batch) return err("NOT_FOUND", "Batch tidak ditemukan", 404);
  if (!["COMPLETED", "FAILED", "RECONCILED"].includes(batch.status)) {
    return err("INVALID_STATUS", "Retry hanya setelah import dijalankan", 409);
  }

  try {
    const result = await retryFailedItems(batchId, user.id);
    return ok(result);
  } catch (e) {
    logServerError("admin-migration-$batchId$-retry", e);
    return err("RETRY_FAILED", safeErrorMessage("RETRY_FAILED"), 500);
  }
}
