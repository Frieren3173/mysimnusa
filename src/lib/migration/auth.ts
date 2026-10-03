import { getCurrentUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/constants";

export type MigrationUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Auth guard for migration API routes (SUPER_ADMIN or admin.migration.manage). */
export async function requireMigrationUser(): Promise<MigrationUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!user.hasPermission(PERMISSIONS.ADMIN_MIGRATION) && !user.isSuperAdmin()) return null;
  return user;
}
