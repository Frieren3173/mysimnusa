/**
 * Central secret access for MYSIMNUSA.
 *
 * Two secrets are read here and nowhere else:
 *
 *   AUTH_SECRET            signs session JWTs and (by derivation) encrypts the
 *                          Google OAuth tokens at rest.
 *   TOKEN_ENCRYPTION_KEY   optional, dedicated key for Google token encryption.
 *
 * Validation is **lazy** (on first use, not at import time) so that merely
 * importing a module never crashes a build. `next build` runs with
 * `NEXT_PHASE === "phase-production-build"`, where the runtime secret is
 * intentionally absent — that phase is exempt from the hard requirement.
 *
 * In production runtime, a missing/short AUTH_SECRET throws a clear error.
 * In development a well-known fallback is allowed so local work never breaks.
 */

const DEV_FALLBACK = "dev-secret-change-in-production-32chars";
const MIN_SECRET_LENGTH = 32;

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * Returns the signing secret used for sessions. Throws in production runtime
 * when unset or too short; returns a dev fallback otherwise.
 */
export function authSecret(): string {
  const value = process.env.AUTH_SECRET?.trim() ?? "";

  if (value.length >= MIN_SECRET_LENGTH) return value;

  // Build phase: env is not expected; never fail the build over it.
  if (isBuildPhase()) return value || DEV_FALLBACK;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `AUTH_SECRET tidak valid: wajib diisi dan minimal ${MIN_SECRET_LENGTH} karakter. ` +
        "Set variabel lingkungan AUTH_SECRET di production (Vercel) dengan string acak yang panjang.",
    );
  }

  // Development / test: allow a local fallback so nothing blocks local work.
  return DEV_FALLBACK;
}

/**
 * Key material for AES-256-GCM token encryption.
 *
 * Priority:
 *   1. TOKEN_ENCRYPTION_KEY (if set) — SHA-256 derived to 32 bytes.
 *   2. AUTH_SECRET                      — SHA-256 derived (legacy behaviour).
 *
 * The legacy derivation MUST stay identical so already-encrypted Google tokens
 * remain decryptable. Tokens use the `v1.` wire format; this module never
 * changes that.
 */
export function tokenEncryptionSecret(): string {
  const dedicated = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (dedicated) return dedicated;
  return authSecret();
}

/** True when a dedicated TOKEN_ENCRYPTION_KEY is configured. */
export function hasDedicatedTokenKey(): boolean {
  return Boolean(process.env.TOKEN_ENCRYPTION_KEY?.trim());
}

export const SECRET_CONSTANTS = { MIN_SECRET_LENGTH, DEV_FALLBACK } as const;
