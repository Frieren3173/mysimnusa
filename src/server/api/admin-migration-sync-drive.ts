import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { runSyncChunk } from "@/lib/migration/sync";
import { logServerError, safeErrorMessage } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const body = await req.json().catch(() => ({}));
  const limit = Number.isFinite(body?.limit) ? Number(body.limit) : 8;
  const resetFailed = body?.resetFailed === true;

  try {
    return ok(await runSyncChunk(limit, resetFailed));
  } catch (e) {
    logServerError("admin-migration-sync-drive", e);
    return err("SYNC_FAILED", safeErrorMessage("SYNC_FAILED"), 500);
  }
}
