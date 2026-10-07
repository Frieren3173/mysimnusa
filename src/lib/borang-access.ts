import { PERMISSIONS } from "@/lib/constants";

/**
 * Logbook ownership + separation-of-duties policy.
 *
 * Pure helpers (no DB) so they can be unit-tested and reasoned about:
 *
 *  • Creating on behalf of another staff member requires a privileged
 *    permission; a regular user may only create for their own `staff.id`.
 *  • Editing / deleting an entry is limited to its owner (or a privileged
 *    user), and only while the entry is in DRAFT / REJECTED (deletion still
 *    additionally requires ARCHIVED + archive permission in the route).
 *  • The verifier and the approver must not be the creator/owner, and the
 *    approver must not be the same person as the verifier.
 */

/**
 * Freeze the "may act on behalf" privileges. Kept as a single constant so the
 * policy is visible in one place.
 *
 * NOTE: SUPER_ADMIN is intentionally NOT exempt by default. Flip
 * `ALLOW_SUPER_ADMIN_BYPASS` to `true` to grant super admins an override.
 */
export const ALLOW_SUPER_ADMIN_BYPASS = false;

/** Permissions that allow acting on another staff member's behalf. */
export const MANAGE_ON_BEHALF_PERMISSIONS: readonly string[] = [
  PERMISSIONS.BORANG_LOGBOOK_VERIFY,
  PERMISSIONS.BORANG_LOGBOOK_APPROVE,
  PERMISSIONS.BORANG_LOGBOOK_ARCHIVE,
  PERMISSIONS.ADMIN_SETTINGS,
];

export interface Actor {
  id: string;
  staff?: { id: string } | null;
  hasPermission: (perm: string) => boolean;
  isSuperAdmin: () => boolean;
}

/** The current user's staff id, if their account is linked to a Staff row. */
function actorStaffId(actor: Actor): string | null {
  return actor.staff?.id ?? null;
}

/** True when the actor may create/modify entries for staff other than their own. */
export function canActOnBehalf(actor: Actor): boolean {
  if (ALLOW_SUPER_ADMIN_BYPASS && actor.isSuperAdmin()) return true;
  return MANAGE_ON_BEHALF_PERMISSIONS.some((perm) => actor.hasPermission(perm));
}

/** True when the actor may edit/delete this entry. Legacy rows (no owner) are permissive. */
export function isEntryOwnerOrPrivileged(
  actor: Actor,
  entry: { createdById: string | null; staffId: string },
): boolean {
  if (ALLOW_SUPER_ADMIN_BYPASS && actor.isSuperAdmin()) return true;
  if (entry.createdById && entry.createdById === actor.id) return true;
  if (actorStaffId(actor) && actorStaffId(actor) === entry.staffId) return true;
  // Legacy entries created before ownership tracking have no owner — do not lock
  // out the people who can legitimately service them.
  if (!entry.createdById) return true;
  return canActOnBehalf(actor);
}

/** Statuses in which an entry is still editable by its owner. */
export const EDITABLE_STATUSES = ["DRAFT", "REJECTED"] as const;

export function isEditableStatus(status: string): boolean {
  return (EDITABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Separation-of-duties check for a workflow transition.
 *
 * Returns null when allowed, or a short Indonesian reason when denied.
 */
export function separationOfDutiesViolation(
  actor: Actor,
  entry: { createdById: string | null; staffId: string; verifierId: string | null },
  action: "VERIFY" | "APPROVE",
): string | null {
  const isCreator =
    (entry.createdById !== null && entry.createdById === actor.id) ||
    (actorStaffId(actor) !== null && actorStaffId(actor) === entry.staffId);

  if (isCreator) {
    return action === "VERIFY"
      ? "Pemilik entri tidak dapat memverifikasi entrinya sendiri."
      : "Pemilik entri tidak dapat menyetujui entrinya sendiri.";
  }

  if (action === "APPROVE" && entry.verifierId && entry.verifierId === actor.id) {
    return "Penyetuju harus berbeda dari pemverifikasi.";
  }

  return null;
}
