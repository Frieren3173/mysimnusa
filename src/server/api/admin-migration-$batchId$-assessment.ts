import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { assessBatch } from "@/lib/migration/engine";
import { logServerError, safeErrorMessage } from "@/lib/logger";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { batchId } = await params;
  try {
    return ok(await assessBatch(batchId));
  } catch (e) {
    logServerError("admin-migration-$batchId$-assessment", e);
    return err("ASSESS_FAILED", safeErrorMessage("ASSESS_FAILED"), 500);
  }
}
