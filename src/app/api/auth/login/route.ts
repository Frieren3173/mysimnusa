import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie } from "@/lib/auth";
import { ok, err, parseBody } from "@/lib/api";
import { z } from "zod";

const LoginSchema = z.object({
  username: z.string().min(1, "Username wajib diisi").max(100),
  password: z.string().min(1, "Password wajib diisi").max(200),
});

// Rate limiting — simple in-memory store (replace with Redis in production)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = parseInt(process.env.LOGIN_RATE_LIMIT_MAX ?? "5");
const WINDOW_MS = parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? "900000"); // 15 min

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || record.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }

  if (record.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - record.count };
}

function resetRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // Rate limiting
  const { allowed } = checkRateLimit(ip);
  if (!allowed) {
    return err(
      "RATE_LIMIT_EXCEEDED",
      "Terlalu banyak percobaan login. Coba lagi dalam 15 menit.",
      429
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("INVALID_JSON", "Request tidak valid", 400);
  }

  const { data, error } = parseBody(LoginSchema, body);
  if (error) return error;

  // Find user
  const user = await prisma.user.findUnique({
    where: { username: data.username },
  });

  // Constant-time comparison to prevent timing attacks
  const hash = user?.passwordHash ?? "$2b$12$invalidhashfortimingprotection";
  const isValid = await bcrypt.compare(data.password, hash);

  if (!user || !isValid) {
    return err("INVALID_CREDENTIALS", "Username atau password salah", 401);
  }

  if (!user.isActive) {
    return err("ACCOUNT_DISABLED", "Akun tidak aktif. Hubungi administrator.", 403);
  }

  // Login success — reset rate limit and create session
  resetRateLimit(ip);

  const token = await createSession(user.id);
  await setSessionCookie(token);

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return ok({ message: "Login berhasil" });
}
