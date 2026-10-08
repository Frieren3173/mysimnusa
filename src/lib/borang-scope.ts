import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import type { CurrentUser } from "@/lib/auth";

/**
 * Server-side room scoping for the Borang workflow.
 *
 * These helpers answer "which Borang entries may this actor see / act on?" and
 * are used to enforce cross-room isolation in the API — NOT in the UI. Menu
 * visibility alone is never sufficient.
 *
 * Scoping rules:
 *  • Superadmin  → all entries.
 *  • DIKLAT_BORANG (secretariat) → all entries (administrative processing).
 *  • KEPALA_RUANG → entries whose snapshot Kepala Ruang is this user, plus
 *    entries in rooms they are currently assigned to.
 *  • Legacy ADMIN_BORANG / VERIFIER / ADMIN_KOMITE / VIEWER → all entries
 *    (read), preserving existing behaviour.
 *  • USER / STAFF → only their own staff's entries, within their own room.
 */

export interface BorangScope {
  /** true = unrestricted (all rooms). */
  unrestricted: boolean;
  /** Room ids the actor is explicitly assigned to as Kepala Ruang. */
  assignedRoomIds: string[];
  /** The actor's own staff id (when linked). */
  staffId: string | null;
  /** The actor's own room id (when linked). */
  roomId: string | null;
  isKaru: boolean;
  isSecretariat: boolean;
  isSuperAdmin: boolean;
}

const UNRESTRICTED_LEGACY_ROLES = [
  ROLES.ADMIN_BORANG,
  ROLES.VERIFIER,
  ROLES.ADMIN_KOMITE,
  ROLES.VIEWER,
];

/** Loads the scope for the current actor (one query for KARU assignments). */
export async function loadBorangScope(user: CurrentUser): Promise<BorangScope> {
  const isSuperAdmin = user.isSuperAdmin();
  const isKaru = user.hasRole(ROLES.KEPALA_RUANG);
  const isSecretariat = user.hasRole(ROLES.DIKLAT_BORANG);
  const hasLegacyFullAccess = UNRESTRICTED_LEGACY_ROLES.some((r) => user.hasRole(r));

  let assignedRoomIds: string[] = [];
  if (isKaru && !isSuperAdmin) {
    const rows = await prisma.roomKepalaRuang.findMany({
      where: { userId: user.id },
      select: { roomId: true },
    });
    assignedRoomIds = rows.map((r) => r.roomId);
  }

  return {
    unrestricted: isSuperAdmin || isSecretariat || hasLegacyFullAccess,
    assignedRoomIds,
    staffId: user.staff?.id ?? null,
    roomId: user.staff?.roomId ?? null,
    isKaru,
    isSecretariat,
    isSuperAdmin,
  };
}

/**
 * Builds the Prisma `where` fragment that limits a Borang entry list to what the
 * actor is allowed to read. Returns `undefined` for unrestricted actors.
 */
export function borangListWhere(scope: BorangScope, actorId: string): Record<string, unknown> | undefined {
  if (scope.unrestricted) return undefined;

  const conditions: Record<string, unknown>[] = [];
  if (scope.staffId) conditions.push({ staffId: scope.staffId });
  conditions.push({ createdById: actorId });
  if (scope.isKaru && scope.assignedRoomIds.length > 0) {
    conditions.push({ roomId: { in: scope.assignedRoomIds } });
    conditions.push({ kepalaRuangUserId: actorId });
  }
  return { OR: conditions };
}

/**
 * Whether the actor may read/act on a single entry. Mirrors `borangListWhere`
 * for a concrete entry, so the detail/update/workflow routes can enforce the
 * same rule as the list without a second query.
 */
export function canAccessBorangEntry(
  scope: BorangScope,
  actorId: string,
  entry: {
    createdById: string | null;
    staffId: string;
    roomId: string | null;
    kepalaRuangUserId: string | null;
  },
): boolean {
  if (scope.unrestricted) return true;
  if (entry.createdById && entry.createdById === actorId) return true;
  if (scope.staffId && entry.staffId === scope.staffId) return true;
  if (scope.isKaru) {
    if (entry.kepalaRuangUserId && entry.kepalaRuangUserId === actorId) return true;
    if (entry.roomId && scope.assignedRoomIds.includes(entry.roomId)) return true;
  }
  return false;
}
