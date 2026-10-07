import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie } from "@/lib/auth";
import { ok, err, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import {
  clientIpFromHeaders,
  limitsFromEnv,
  ipKey,
  userKey,
  checkKeys,
  registerFailure,
  clearKeys,
  pruneExpired,
} from "@/lib/login-rate-limit";
import { z } from "zod";

const LoginSchema = z.object({
  username: z.string().min(1, "Username wajib diisi").max(100),
  password: z.string().min(1, "Password wajib diisi").max(200),
});

/**
 * A stable, valid bcrypt hash used only to equalise response time when the
 * username does not exist. Generated once at module load so every request —
 * whether the user exists or not — performs exactly one real bcrypt compare.
 */
const TIMING_DUMMY_HASH = bcrypt.hashSync("timing-equalizer-placeholder", 12);

export async function POST(req: NextRequest) {
  const { ipMax, userMax, windowMs } = limitsFromEnv();
  const ip = clientIpFromHeaders(req.headers);

  // Parse body first so the username key is available.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("INVALID_JSON", "Request tidak valid", 400);
  }

  const { data, error } = parseBody(LoginSchema, body);
  if (error) return error;

  const iKey = ipKey(ip);
  const uKey = userKey(data.username);

  // Pre-check both keys without consuming an attempt.
  const decision = await checkKeys([
    { key: iKey, max: ipMax },
    { key: uKey, max: userMax },
  ]);
  if (!decision.allowed) {
    // Opportunistic cleanup must never delay the rejection.
    void pruneExpired().catch(() => undefined);
    const res = err(
      "RATE_LIMIT_EXCEEDED",
      "Terlalu banyak percobaan login. Coba lagi dalam 15 menit.",
      429,
    );
    res.headers.set("Retry-After", String(decision.retryAfterSeconds));
    return res;
  }

  // Find user
  const user = await prisma.user.findUnique({
    where: { username: data.username },
  });

  // Constant-time comparison to mitigate username enumeration via timing.
  const hash = user?.passwordHash ?? TIMING_DUMMY_HASH;
  const isValid = await bcrypt.compare(data.password, hash);

  if (!user || !isValid) {
    // Record the failure on both keys; a lock engages once either hits its cap.
    const [ipDecision] = await Promise.all([
      registerFailure(iKey, ipMax, windowMs),
      registerFailure(uKey, userMax, windowMs),
    ]);
    void pruneExpired().catch(() => undefined);

    await logAudit({
      userId: null,
      module: "auth",
      resource: "login",
      action: "LOGIN_FAILED",
      after: { username: data.username.toLowerCase(), ip },
      ipAddress: ip,
    });

    if (!ipDecision.allowed) {
      const res = err(
        "RATE_LIMIT_EXCEEDED",
        "Terlalu banyak percobaan login. Coba lagi dalam 15 menit.",
        429,
      );
      res.headers.set("Retry-After", String(ipDecision.retryAfterSeconds));
      return res;
    }

    return err("INVALID_CREDENTIALS", "Username atau password salah", 401);
  }

  if (!user.isActive) {
    return err("ACCOUNT_DISABLED", "Akun tidak aktif. Hubungi administrator.", 403);
  }

  // Login success — clear counters for both keys.
  await clearKeys([iKey, uKey]);

  // Drop this user's expired sessions, and a bounded slice of expired sessions
  // globally, so the table does not accumulate dead rows without a cron.
  const now = new Date();
  await prisma.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: now } } });
  void pruneExpiredSessions();

  const token = await createSession(user.id);
  await setSessionCookie(token);

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await logAudit({
    userId: user.id,
    module: "auth",
    resource: "login",
    action: "LOGIN_SUCCESS",
    ipAddress: ip,
  });

  return ok({ message: "Login berhasil" });
}

/** Removes up to 50 globally-expired sessions (best-effort, never throws). */
async function pruneExpiredSessions(): Promise<void> {
  try {
    const stale = await prisma.session.findMany({
      where: { expiresAt: { lt: new Date() } },
      select: { id: true },
      take: 50,
    });
    if (stale.length === 0) return;
    await prisma.session.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  } catch {
    // best-effort
  }
}
