import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";

const CANCELLABLE = ["DRAFT", "SCANNING", "SCANNED", "MAPPING_REVIEW", "VALIDATING", "READY", "PAUSED"] as const;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { batchId } = await params;
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } });
  if (!batch) return err("NOT_FOUND", "Batch tidak ditemukan", 404);

  if (!(CANCELLABLE as readonly string[]).includes(batch.status)) {
    return err("NOT_CANCELLABLE", `Batch berstatus ${batch.status} tidak dapat dibatalkan`, 409);
  }

  const updated = await prisma.migrationBatch.update({
    where: { id: batchId },
    data: { status: "CANCELLED", completedAt: new Date() },
  });

  return ok({ batch: updated });
}
