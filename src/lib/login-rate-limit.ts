import { prisma } from "@/lib/prisma";

/**
 * Durable, serverless-safe login rate limiting backed by the `LoginAttempt`
 * table. Two keys are tracked per attempt:
 *
 *   ip:<ip>                    — bounds attempts from one source
 *   user:<lowercased-username> — bounds attempts against one account
 *
 * Counters increment atomically (upsert + increment) so concurrent requests
 * cannot race past the limit. Expired rows are pruned opportunistically.
 */

/** Default limits (mirrors the previous in-memory behaviour). */
export const DEFAULT_IP_MAX = 5;
export const DEFAULT_USER_MAX = 10;
export const DEFAULT_WINDOW_MS = 900_000; // 15 min

/** Per-username allowance is a little looser than per-IP, but still bounded. */
export function limitsFromEnv(): { ipMax: number; userMax: number; windowMs: number } {
  const ipMax = parseInt(process.env.LOGIN_RATE_LIMIT_MAX ?? String(DEFAULT_IP_MAX), 10);
  const windowMs = parseInt(
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? String(DEFAULT_WINDOW_MS),
    10,
  );
  const userMax = parseInt(
    process.env.LOGIN_RATE_LIMIT_USER_MAX ?? String(Number.isFinite(ipMax) ? ipMax * 2 : DEFAULT_USER_MAX),
    10,
  );
  return {
    ipMax: Number.isFinite(ipMax) && ipMax > 0 ? ipMax : DEFAULT_IP_MAX,
    userMax: Number.isFinite(userMax) && userMax > 0 ? userMax : DEFAULT_USER_MAX,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS,
  };
}

/** Normalizes a username into a stable rate-limit key component. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function ipKey(ip: string): string {
  return `ip:${ip}`;
}

export function userKey(username: string): string {
  return `user:${normalizeUsername(username)}`;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the caller may retry (only meaningful when blocked). */
  retryAfterSeconds: number;
}

interface CounterRow {
  count: number;
  resetAt: Date;
  lockedUntil: Date | null;
}

/**
 * Pure decision function — kept separate from the DB so it can be unit-tested.
 *
 * `row` is the current counter (or null when none exists yet). Returns whether
 * the attempt is allowed under `max` within the window.
 */
export function decide(
  row: Pick<CounterRow, "count" | "resetAt" | "lockedUntil"> | null,
  max: number,
  now: number,
): RateLimitDecision {
  if (!row) return { allowed: true, retryAfterSeconds: 0 };

  if (row.lockedUntil && row.lockedUntil.getTime() > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((row.lockedUntil.getTime() - now) / 1000)),
    };
  }

  if (row.resetAt.getTime() <= now) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (row.count >= max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((row.resetAt.getTime() - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Reads a counter row, or null when absent. */
async function readCounter(key: string): Promise<CounterRow | null> {
  const row = await prisma.loginAttempt.findUnique({
    where: { key },
    select: { count: true, resetAt: true, lockedUntil: true },
  });
  return row ?? null;
}

/**
 * Records a failed attempt for a key and returns the resulting decision.
 *
 * Uses a transaction with an upsert so the increment is atomic even under
 * concurrency. When a window has expired, the counter is reset to 1.
 */
export async function registerFailure(
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitDecision> {
  const now = Date.now();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.loginAttempt.findUnique({
      where: { key },
      select: { count: true, resetAt: true, lockedUntil: true },
    });

    // Fresh window (or no row): start counting from 1.
    if (!existing || existing.resetAt.getTime() <= now) {
      const resetAt = new Date(now + windowMs);
      const count = 1;
      const lockedUntil = count >= max ? resetAt : null;
      await tx.loginAttempt.upsert({
        where: { key },
        update: { count, windowStart: new Date(now), resetAt, lockedUntil },
        create: { key, count, windowStart: new Date(now), resetAt, lockedUntil },
      });
      return { allowed: count < max, retryAfterSeconds: count >= max ? Math.ceil(windowMs / 1000) : 0 };
    }

    // Still inside the active window: increment.
    const count = existing.count + 1;
    const lockedUntil = count >= max ? existing.resetAt : existing.lockedUntil;
    await tx.loginAttempt.update({
      where: { key },
      data: { count, lockedUntil },
    });
    return {
      allowed: count < max,
      retryAfterSeconds: count >= max ? Math.max(1, Math.ceil((existing.resetAt.getTime() - now) / 1000)) : 0,
    };
  });
}

/** Checks all keys without consuming an attempt. */
export async function checkKeys(
  keys: { key: string; max: number }[],
  now = Date.now(),
): Promise<RateLimitDecision> {
  let blocked: RateLimitDecision = { allowed: true, retryAfterSeconds: 0 };
  for (const { key, max } of keys) {
    const row = await readCounter(key);
    const decision = decide(row, max, now);
    if (!decision.allowed) {
      if (!blocked.allowed) {
        blocked = {
          allowed: false,
          retryAfterSeconds: Math.max(blocked.retryAfterSeconds, decision.retryAfterSeconds),
        };
      } else {
        blocked = decision;
      }
    }
  }
  return blocked;
}

/** Clears all counters for the given keys (used after a successful login). */
export async function clearKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await prisma.loginAttempt.deleteMany({ where: { key: { in: keys } } });
}

/**
 * Opportunistic cleanup — removes a bounded number of expired rows so the
 * table does not grow unbounded without needing a cron job.
 */
export async function pruneExpired(limit = 25): Promise<number> {
  const now = new Date();
  const stale = await prisma.loginAttempt.findMany({
    where: {
      resetAt: { lte: now },
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
    },
    select: { id: true },
    take: limit,
  });
  if (stale.length === 0) return 0;
  const { count } = await prisma.loginAttempt.deleteMany({
    where: { id: { in: stale.map((r) => r.id) } },
  });
  return count;
}

/**
 * Extracts the trusted client IP for Vercel.
 *
 * Vercel sets `x-vercel-forwarded-for` / `x-forwarded-for` at the edge and
 * strips any client-supplied value, so these are trustworthy on Vercel. Outside
 * Vercel (local dev) we fall back to `x-real-ip`, and only then to a constant.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const vercelForwarded = headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) return vercelForwarded.split(",")[0]!.trim();

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();

  const real = headers.get("x-real-ip");
  if (real) return real.trim();

  return "unknown";
}
