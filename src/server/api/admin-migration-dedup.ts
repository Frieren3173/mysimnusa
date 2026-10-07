import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { dedupDocuments } from "@/lib/migration/sync";
import { logAudit, clientIp } from "@/lib/audit";
import { logServerError, safeErrorMessage } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  try {
    const result = await dedupDocuments();
    await logAudit({
      userId: user.id,
      module: "migration",
      resource: "document",
      resourceId: "dedup",
      action: "DELETE",
      after: result,
      ipAddress: clientIp(req),
    });
    return ok(result);
  } catch (e) {
    logServerError("admin-migration-dedup", e);
    return err("DEDUP_FAILED", safeErrorMessage("DEDUP_FAILED"), 500);
  }
}
