import { PERMISSIONS, ROLES } from "@/lib/constants";

/**
 * Borang workflow v1 — single source of truth for statuses, role scoping and
 * the transition graph.
 *
 * Kept free of DB / React imports so it is unit-testable and shareable between
 * server enforcement (API routes) and the UI (badges, tab filters).
 *
 * The legacy logbook workflow (SUBMITTED → VERIFICATION → APPROVED → ARCHIVED)
 * is preserved for backward compatibility; the new review chain runs in
 * parallel and is driven by the added statuses.
 */

// ─────────────────────────────────────────────────────────────
// Statuses
// ─────────────────────────────────────────────────────────────

/** Statuses used by the new Kepala Ruang / sekretariat workflow (ordered). */
export const WORKFLOW_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "REVISION_REQUIRED",
  "APPROVED_KARU",
  "READY_TO_PRINT",
  "PRINTED",
  "COMPLETED",
] as const;

/** Legacy statuses retained for pre-workflow entries. */
export const LEGACY_STATUSES = [
  "VERIFICATION",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
] as const;

export type BorangStatusName =
  | (typeof WORKFLOW_STATUSES)[number]
  | (typeof LEGACY_STATUSES)[number];

/** Human-readable labels for every status (both legacy and new). */
export const BORANG_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draf",
  SUBMITTED: "Diajukan",
  REVISION_REQUIRED: "Perlu Revisi",
  APPROVED_KARU: "Disetujui Kepala Ruang",
  READY_TO_PRINT: "Siap Dicetak",
  PRINTED: "Sudah Dicetak",
  COMPLETED: "Selesai",
  // legacy
  VERIFICATION: "Verifikasi",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  ARCHIVED: "Diarsipkan",
};

export type BorangStatusVariant =
  | "default"
  | "draft"
  | "pending"
  | "info"
  | "active"
  | "rejected"
  | "archived";

export const BORANG_STATUS_VARIANT: Record<string, BorangStatusVariant> = {
  DRAFT: "draft",
  SUBMITTED: "pending",
  REVISION_REQUIRED: "rejected",
  APPROVED_KARU: "info",
  READY_TO_PRINT: "active",
  PRINTED: "active",
  COMPLETED: "active",
  // legacy
  VERIFICATION: "info",
  APPROVED: "active",
  REJECTED: "rejected",
  ARCHIVED: "archived",
};

/** Statuses in which the submitting user may still edit their entry. */
export const USER_EDITABLE_STATUSES = ["DRAFT", "REVISION_REQUIRED"] as const;

export function isUserEditableStatus(status: string): boolean {
  return (USER_EDITABLE_STATUSES as readonly string[]).includes(status);
}

// ─────────────────────────────────────────────────────────────
// Role scoping for the business workflow
// ─────────────────────────────────────────────────────────────

/** True for either the legacy or the business superadmin role. */
export function isSuperAdminRole(roles: readonly string[]): boolean {
  return roles.includes(ROLES.SUPER_ADMIN) || roles.includes(ROLES.SUPERADMIN);
}

/** True when the account holds the Kepala Ruang business role. */
export function isKepalaRuangRole(roles: readonly string[]): boolean {
  return roles.includes(ROLES.KEPALA_RUANG);
}

/** True when the account holds the secretariat (DIKLAT_BORANG) business role. */
export function isDiklatBorangRole(roles: readonly string[]): boolean {
  return roles.includes(ROLES.DIKLAT_BORANG);
}

// ─────────────────────────────────────────────────────────────
// Transition graph (new workflow)
// ─────────────────────────────────────────────────────────────

export interface WorkflowTransition {
  /** Allowed source statuses. */
  from: string[];
  /** Resulting status. */
  to: string;
  /** Permission required to trigger it. */
  permission: string;
  /** Audit action recorded. */
  audit: string;
}

/**
 * New workflow transitions.
 *
 * DRAFT            → SUBMITTED           (submit, user)
 * SUBMITTED        → APPROVED_KARU       (Kepala Ruang approve)
 * SUBMITTED        → REVISION_REQUIRED   (Kepala Ruang request revision, note required)
 * REVISION_REQUIRED→ SUBMITTED           (user resubmit)
 * APPROVED_KARU    → READY_TO_PRINT      (sekretariat finalise)
 * APPROVED_KARU    → REVISION_REQUIRED   (sekretariat request revision, note required)
 * READY_TO_PRINT   → PRINTED             (sekretariat print)
 * PRINTED          → COMPLETED           (sekretariat complete)
 */
export const WORKFLOW_TRANSITIONS: Record<string, WorkflowTransition> = {
  SUBMIT: {
    from: ["DRAFT", "REVISION_REQUIRED", "REJECTED"],
    to: "SUBMITTED",
    permission: PERMISSIONS.BORANG_LOGBOOK_SUBMIT,
    audit: "SUBMITTED",
  },
  APPROVE_KARU: {
    from: ["SUBMITTED"],
    to: "APPROVED_KARU",
    permission: PERMISSIONS.BORANG_KARU_REVIEW,
    audit: "APPROVE_KARU",
  },
  REQUEST_REVISION: {
    from: ["SUBMITTED", "APPROVED_KARU"],
    to: "REVISION_REQUIRED",
    permission: PERMISSIONS.BORANG_KARU_REVIEW,
    audit: "REQUEST_REVISION",
  },
  ADMIN_REVISION: {
    from: ["APPROVED_KARU"],
    to: "REVISION_REQUIRED",
    permission: PERMISSIONS.BORANG_ADMIN_REVIEW,
    audit: "REQUEST_REVISION",
  },
  READY_TO_PRINT: {
    from: ["APPROVED_KARU"],
    to: "READY_TO_PRINT",
    permission: PERMISSIONS.BORANG_ADMIN_REVIEW,
    audit: "ADMINISTRATIVE_APPROVAL",
  },
  PRINT: {
    from: ["READY_TO_PRINT"],
    to: "PRINTED",
    permission: PERMISSIONS.BORANG_PRINT,
    audit: "PRINT",
  },
  COMPLETE: {
    from: ["PRINTED"],
    to: "COMPLETED",
    permission: PERMISSIONS.BORANG_COMPLETE,
    audit: "COMPLETE",
  },
};

/** Actions whose transition requires a note/reason. */
export const NOTE_REQUIRED_ACTIONS = ["REQUEST_REVISION", "ADMIN_REVISION"] as const;

export function requiresNote(action: string): boolean {
  return (NOTE_REQUIRED_ACTIONS as readonly string[]).includes(action);
}

/**
 * Pure predicate: whether a transition action is allowed from a given status.
 * Server routes additionally check permission + room scoping.
 */
export function canTransition(action: string, fromStatus: string): boolean {
  const t = WORKFLOW_TRANSITIONS[action];
  if (!t) return false;
  return t.from.includes(fromStatus);
}

// ─────────────────────────────────────────────────────────────
// Final print eligibility (single source of truth — frontend + backend)
// ─────────────────────────────────────────────────────────────

/**
 * Statuses in which a Borang may be printed as the FINAL result. Reaching any of
 * these requires BOTH the Kepala Ruang approval (APPROVED_KARU) and the
 * Sekretariat approval (READY_TO_PRINT). Printing is permitted from READY_TO_PRINT
 * onward.
 */
export const FINAL_PRINTABLE_STATUSES = ["READY_TO_PRINT", "PRINTED", "COMPLETED"] as const;

/** True when the entry has completed both verification stages and may be printed. */
export function canPrintFinal(status: string): boolean {
  return (FINAL_PRINTABLE_STATUSES as readonly string[]).includes(status);
}

// ─────────────────────────────────────────────────────────────
// Reviewer scoping (pure)
// ─────────────────────────────────────────────────────────────

/**
 * Whether an actor may act as Kepala Ruang on an entry.
 *
 * Rules:
 *  • Superadmin: always (full access).
 *  • Kepala Ruang: only when the entry's room is one they are assigned to.
 *    The assignment is matched on the *snapshot* Kepala Ruang user captured at
 *    submit time, falling back to the entry's room — never inferred from the
 *    Staff–Room relation.
 */
export function canReviewAsKaru(
  actor: { id: string; roles: readonly string[]; isSuperAdmin: () => boolean },
  args: { kepalaRuangUserId: string | null; roomId: string | null; assignedRoomIds: readonly string[] },
): boolean {
  if (actor.isSuperAdmin()) return true;
  if (args.kepalaRuangUserId && args.kepalaRuangUserId === actor.id) return true;
  // Before a snapshot exists (or for legacy rows), fall back to room assignment.
  if (!args.kepalaRuangUserId && args.roomId) {
    return args.assignedRoomIds.includes(args.roomId);
  }
  return false;
}
