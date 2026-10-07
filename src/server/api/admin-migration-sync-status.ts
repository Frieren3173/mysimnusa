import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { getSyncStatus } from "@/lib/migration/sync";
import { logServerError, safeErrorMessage } from "@/lib/logger";

export async function GET() {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  try {
    return ok(await getSyncStatus());
  } catch (e) {
    logServerError("admin-migration-sync-status", e);
    return err("STATUS_FAILED", safeErrorMessage("STATUS_FAILED"), 500);
  }
}
