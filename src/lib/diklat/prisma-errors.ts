/**
 * Prisma error classification helpers — PURE and DB-free so they are unit
 * testable and shared by the API routes.
 *
 * Why this exists: a `catch` that maps EVERY failure to a "duplicate" message
 * hides real database errors (connection loss, check violations, …) behind a
 * misleading user-facing reason. We only map an error to "already exists" when
 * we can positively identify it as a unique-constraint violation on the
 * EXPECTED target.
 *
 * Prisma version: v6 (see package.json). `PrismaClientKnownRequestError` carries
 * `code` and a `meta.target` that is EITHER the list of field names
 * (`["trainingId","staffId"]`) or the constraint/index name
 * (`trainingId_staffId_key`), depending on the driver. We accept both shapes.
 */

/** A unique-constraint violation (Prisma P2002). */
export const PRISMA_UNIQUE_VIOLATION = "P2002";

/** A write conflict / deadlock — retryable (Prisma P2034). */
export const PRISMA_WRITE_CONFLICT = "P2034";

interface PrismaErrorLike {
  code?: unknown;
  meta?: { target?: unknown } | null;
}

function asErrorLike(e: unknown): PrismaErrorLike | null {
  return typeof e === "object" && e !== null ? (e as PrismaErrorLike) : null;
}

export function prismaErrorCode(e: unknown): string | null {
  const err = asErrorLike(e);
  return typeof err?.code === "string" ? err.code : null;
}

/** True for Prisma P2034 (write conflict / deadlock — safe to retry). */
export function isWriteConflict(e: unknown): boolean {
  return prismaErrorCode(e) === PRISMA_WRITE_CONFLICT;
}

/**
 * Normalises Prisma's `meta.target` into a flat string list. Handles:
 *   • string[]  → ["trainingId","staffId"]
 *   • string    → "trainingId_staffId_key"  (split on the constraint separator)
 *   • anything else → []
 */
export function uniqueTargetFields(e: unknown): string[] {
  const target = asErrorLike(e)?.meta?.target;
  if (Array.isArray(target)) {
    return target.filter((t): t is string => typeof t === "string");
  }
  if (typeof target === "string") {
    // Constraint names look like `trainingId_staffId_key`; the field names we
    // care about contain no underscore, so a plain split is sufficient here.
    return target.split("_key")[0].split("_").filter(Boolean);
  }
  return [];
}

/**
 * True ONLY when `e` is a unique-constraint violation (P2002) on the given set
 * of fields. When the failure is a P2002 on a DIFFERENT constraint, or any other
 * error, this returns false so the caller can surface a non-duplicate error.
 */
export function isUniqueViolationOn(e: unknown, fields: string[]): boolean {
  if (prismaErrorCode(e) !== PRISMA_UNIQUE_VIOLATION) return false;
  const target = uniqueTargetFields(e);
  // Prisma may omit `target` for some drivers/versions: then we can only trust
  // the code. Treat a P2002 with NO target info as matching (the caller's query
  // has a single unique constraint, so a P2002 there is almost certainly it).
  if (target.length === 0) return true;
  return fields.every((f) => target.includes(f));
}
