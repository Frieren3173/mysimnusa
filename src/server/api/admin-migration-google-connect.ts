import { NextRequest } from "next/server";
import { requireMigrationUser } from "@/lib/migration/auth";
import { ok, err } from "@/lib/api";
import { buildAuthUrl, isGoogleConfigured, getConnectionPublic, isGoogleRole, type GoogleRole } from "@/lib/google/auth";

/**
 * Starts the Google OAuth flow for a specific role.
 *
 * The role is validated server-side against a fixed allow-list; anything else is
 * rejected. SOURCE requests read-only scopes, DESTINATION requests write scopes.
 */
export async function POST(req: NextRequest) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);
  if (!isGoogleConfigured()) {
    return err(
      "GOOGLE_NOT_CONFIGURED",
      "Isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di .env terlebih dahulu",
      503
    );
  }

  // Role comes from the request body but is only ever trusted after validation
  // against the allowed set. Defaults to SOURCE when omitted (legacy callers).
  const body = await req.json().catch(() => null);
  const requested = (body as { role?: unknown } | null)?.role ?? "SOURCE";
  if (!isGoogleRole(requested)) {
    return err("INVALID_ROLE", "Peran koneksi Google harus SOURCE atau DESTINATION", 422);
  }
  const role: GoogleRole = requested;

  const connection = await getConnectionPublic(role);
  return ok({ url: buildAuthUrl(user.id, role), role, status: connection.status });
}
