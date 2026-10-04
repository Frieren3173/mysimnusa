import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { validateBatch } from "@/lib/migration/engine";

export async function POST(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { batchId } = await params;
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } });
  if (!batch) return err("NOT_FOUND", "Batch tidak ditemukan", 404);
  if (!["MAPPING_REVIEW", "SCANNED", "READY"].includes(batch.status)) {
    return err("INVALID_STATUS", `Status "${batch.status}" tidak dapat divalidasi`, 409);
  }

  try {
    const result = await validateBatch(batchId);
    return ok(result);
  } catch (e) {
    return err("VALIDATION_FAILED", e instanceof Error ? e.message : "Validasi gagal", 500);
  }
}
