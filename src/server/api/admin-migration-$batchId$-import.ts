import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { importBatch } from "@/lib/migration/engine";
import { logAudit, clientIp } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { batchId } = await params;
  const body = await req.json().catch(() => ({}));
  if (body?.acknowledge !== true) {
    return err("CONFIRM_REQUIRED", "Centang konfirmasi import sebelum melanjutkan", 422);
  }

  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } });
  if (!batch) return err("NOT_FOUND", "Batch tidak ditemukan", 404);
  if (batch.status !== "READY") {
    return err("INVALID_STATUS", "Hanya batch berstatus READY yang dapat diimpor", 409);
  }

  try {
    const result = await importBatch(batchId, user.id, { onlyNew: body?.onlyNew === true });
    await logAudit({
      userId: user.id,
      module: "migration",
      resource: "migration_batch",
      resourceId: batchId,
      action: "IMPORTED",
      after: result,
      ipAddress: clientIp(req),
    });
    return ok(result);
  } catch (e) {
    await prisma.migrationBatch
      .update({ where: { id: batchId }, data: { status: "FAILED" } })
      .catch(() => undefined);
    return err("IMPORT_FAILED", e instanceof Error ? e.message : "Import gagal", 500);
  }
}
