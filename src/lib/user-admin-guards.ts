/**
 * User-administration guardrails.
 *
 * Two integrity rules that the API must enforce (kept as pure helpers so they
 * can be unit-tested without a database):
 *
 *  1. A user may not change **their own** roles (prevents self-escalation to
 *     SUPER_ADMIN, and self-demotion that could lock the account out).
 *  2. The last remaining active SUPER_ADMIN may not be demoted, deactivated or
 *     deleted — otherwise the system becomes unadministrable.
 */

export const SUPER_ADMIN_ROLE = "SUPER_ADMIN";

export interface UserAdminActor {
  id: string;
  isSuperAdmin: () => boolean;
}

export interface UserAdminTarget {
  id: string;
  isActive: boolean;
  roles: string[];
}

export type UserAdminViolation = { code: string; message: string } | null;

/** True when the target currently holds the SUPER_ADMIN role. */
export function isSuperAdminTarget(target: UserAdminTarget): boolean {
  return target.roles.includes(SUPER_ADMIN_ROLE);
}

/**
 * Guards a role change. Returns a violation when the actor tries to modify their
 * own roles, or when the change would strip the last SUPER_ADMIN.
 */
export function roleChangeViolation(
  actor: UserAdminActor,
  target: UserAdminTarget,
  newRoles: string[],
  activeSuperAdminCount: number,
): UserAdminViolation {
  if (actor.id === target.id) {
    return { code: "SELF_ROLE_CHANGE", message: "Tidak dapat mengubah peran akun sendiri" };
  }
  const losesSuperAdmin =
    isSuperAdminTarget(target) && !newRoles.includes(SUPER_ADMIN_ROLE);
  if (losesSuperAdmin && activeSuperAdminCount <= 1) {
    return {
      code: "LAST_SUPER_ADMIN",
      message: "Tidak dapat menghapus peran SUPER_ADMIN terakhir",
    };
  }
  return null;
}

/** Guards deactivation. Returns a violation when deactivating self or the last SUPER_ADMIN. */
export function deactivationViolation(
  actor: UserAdminActor,
  target: UserAdminTarget,
  activeSuperAdminCount: number,
): UserAdminViolation {
  if (actor.id === target.id) {
    return { code: "SELF_ACTION", message: "Tidak dapat menonaktifkan akun sendiri" };
  }
  if (isSuperAdminTarget(target) && activeSuperAdminCount <= 1) {
    return {
      code: "LAST_SUPER_ADMIN",
      message: "Tidak dapat menonaktifkan SUPER_ADMIN terakhir",
    };
  }
  return null;
}

/** Guards deletion. Returns a violation when deleting self or the last SUPER_ADMIN. */
export function deletionViolation(
  actor: UserAdminActor,
  target: UserAdminTarget,
  activeSuperAdminCount: number,
): UserAdminViolation {
  if (actor.id === target.id) {
    return { code: "SELF_ACTION", message: "Tidak dapat menghapus akun sendiri" };
  }
  if (isSuperAdminTarget(target) && activeSuperAdminCount <= 1) {
    return {
      code: "LAST_SUPER_ADMIN",
      message: "Tidak dapat menghapus SUPER_ADMIN terakhir",
    };
  }
  return null;
}
