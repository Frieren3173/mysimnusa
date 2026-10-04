import { requireMigrationUser } from "@/lib/migration/auth";
import { ok, err } from "@/lib/api";
import { buildAuthUrl, isGoogleConfigured, getConnectionPublic } from "@/lib/google/auth";

export async function POST() {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);
  if (!isGoogleConfigured()) {
    return err(
      "GOOGLE_NOT_CONFIGURED",
      "Isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di .env terlebih dahulu",
      503
    );
  }

  const connection = await getConnectionPublic();
  return ok({ url: buildAuthUrl(user.id), status: connection.status });
}
