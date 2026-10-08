-- Durable login rate limiting (replaces the in-memory Map).
--
-- One row per key, where a key is `ip:<ip>` or `user:<lowercased-username>`.
-- `count` is incremented atomically; `lockedUntil` blocks further attempts.
-- Additive and safe for production: creates a new table only.

CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "login_attempts_key_key" ON "login_attempts"("key");
CREATE INDEX "login_attempts_resetAt_idx" ON "login_attempts"("resetAt");
CREATE INDEX "login_attempts_lockedUntil_idx" ON "login_attempts"("lockedUntil");

-- Index for opportunistically pruning expired sessions after login.
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");
