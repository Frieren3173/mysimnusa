import { NextRequest } from "next/server";
import { requireMigrationUser } from "@/lib/migration/auth";
import { ok, err } from "@/lib/api";
import { disconnect, getConnectionPublic, isGoogleRole, type GoogleRole } from "@/lib/google/auth";

/** Disconnects the Google account for one role only, validated server-side. */
export async function POST(req: NextRequest) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const body = await req.json().catch(() => null);
  const requested = (body as { role?: unknown } | null)?.role ?? "SOURCE";
  if (!isGoogleRole(requested)) {
    return err("INVALID_ROLE", "Peran koneksi Google harus SOURCE atau DESTINATION", 422);
  }
  const role: GoogleRole = requested;

  try {
    await disconnect(user.id, role);
  } catch {
    // local disconnect still proceeds even if revoke fails
  }
  return ok({ role, connection: await getConnectionPublic(role) });
}
