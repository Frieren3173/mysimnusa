import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { getSyncStatus } from "@/lib/migration/sync";

export async function GET() {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  try {
    return ok(await getSyncStatus());
  } catch (e) {
    return err("STATUS_FAILED", e instanceof Error ? e.message : "Gagal membaca status sinkronisasi", 500);
  }
}
