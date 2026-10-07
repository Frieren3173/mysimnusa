import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { reconcileBatch } from "@/lib/migration/engine";
import { logServerError, safeErrorMessage } from "@/lib/logger";

export async function GET(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { batchId } = await params;
  const recon = await prisma.migrationReconciliation.findUnique({ where: { batchId } });
  if (!recon) return ok({ reconciliation: null });

  // Same shape as POST (reconcileBatch): recon record + derived item lists
  const [items, successCount] = await Promise.all([
    prisma.migrationItem.findMany({
      where: { batchId, status: { in: ["FAILED", "DUPLICATE_REVIEW"] } },
      select: { id: true, status: true, sourceId: true, errorCode: true, errorMessage: true },
    }),
    prisma.migrationItem.count({ where: { batchId, status: "SUCCESS" } }),
  ]);

  return ok({
    reconciliation: {
      ...recon,
      successCount,
      failedItems: items
        .filter((i) => i.status === "FAILED")
        .map((f) => ({
          id: f.id,
          sourceId: f.sourceId,
          errorCode: f.errorCode,
          errorMessage: f.errorMessage,
        })),
      duplicateItems: items
        .filter((i) => i.status === "DUPLICATE_REVIEW")
        .map((d) => ({
          id: d.id,
          sourceId: d.sourceId,
          reason: d.errorMessage,
        })),
    },
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { batchId } = await params;
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } });
  if (!batch) return err("NOT_FOUND", "Batch tidak ditemukan", 404);
  if (!["COMPLETED", "FAILED", "RECONCILED"].includes(batch.status)) {
    return err("INVALID_STATUS", "Rekonsiliasi hanya setelah import dijalankan", 409);
  }

  try {
    const result = await reconcileBatch(batchId);
    return ok(result);
  } catch (e) {
    logServerError("admin-migration-$batchId$-reconciliation", e);
    return err("RECONCILE_FAILED", safeErrorMessage("RECONCILE_FAILED"), 500);
  }
}
