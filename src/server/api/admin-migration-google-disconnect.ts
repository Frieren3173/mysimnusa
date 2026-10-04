import { requireMigrationUser } from "@/lib/migration/auth";
import { ok, err } from "@/lib/api";
import { disconnect, getConnectionPublic } from "@/lib/google/auth";

export async function POST() {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  try {
    await disconnect(user.id);
  } catch {
    // local disconnect still proceeds even if revoke fails
  }
  return ok({ connection: await getConnectionPublic() });
}
