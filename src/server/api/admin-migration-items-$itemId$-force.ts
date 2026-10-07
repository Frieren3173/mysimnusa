import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { forceImportItem } from "@/lib/migration/engine";
import { logServerError, safeErrorMessage } from "@/lib/logger";

export async function POST(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { itemId } = await params;
  try {
    const result = await forceImportItem(itemId, user.id);
    return ok(result);
  } catch (e) {
    logServerError("admin-migration-items-$itemId$-force", e);
    return err("FORCE_IMPORT_FAILED", safeErrorMessage("FORCE_IMPORT_FAILED"), 400);
  }
}
