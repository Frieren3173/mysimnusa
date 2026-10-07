import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  decide,
  limitsFromEnv,
  normalizeUsername,
  ipKey,
  userKey,
  clientIpFromHeaders,
  DEFAULT_IP_MAX,
  DEFAULT_WINDOW_MS,
} from "@/lib/login-rate-limit";

const ORIGINAL_ENV = { ...process.env };

describe("decide()", () => {
  const now = Date.now();

  it("allows when there is no counter", () => {
    expect(decide(null, 5, now).allowed).toBe(true);
  });

  it("allows under the limit", () => {
    const d = decide({ count: 3, resetAt: new Date(now + 60_000), lockedUntil: null }, 5, now);
    expect(d.allowed).toBe(true);
  });

  it("blocks at the limit", () => {
    const d = decide(
      { count: 5, resetAt: new Date(now + 60_000), lockedUntil: null },
      5,
      now,
    );
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets when the window has expired", () => {
    const d = decide({ count: 5, resetAt: new Date(now - 1), lockedUntil: null }, 5, now);
    expect(d.allowed).toBe(true);
  });

  it("honours an explicit lock", () => {
    const d = decide(
      { count: 2, resetAt: new Date(now + 60_000), lockedUntil: new Date(now + 30_000) },
      5,
      now,
    );
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSeconds).toBe(30);
  });

  it("ignores a past lock", () => {
    const d = decide(
      { count: 2, resetAt: new Date(now + 60_000), lockedUntil: new Date(now - 1) },
      5,
      now,
    );
    expect(d.allowed).toBe(true);
  });
});

describe("limitsFromEnv()", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses defaults when unset", () => {
    delete process.env.LOGIN_RATE_LIMIT_MAX;
    delete process.env.LOGIN_RATE_LIMIT_WINDOW_MS;
    delete process.env.LOGIN_RATE_LIMIT_USER_MAX;
    const l = limitsFromEnv();
    expect(l.ipMax).toBe(DEFAULT_IP_MAX);
    expect(l.windowMs).toBe(DEFAULT_WINDOW_MS);
    expect(l.userMax).toBe(DEFAULT_IP_MAX * 2);
  });

  it("reads values from env and keeps the per-user limit looser", () => {
    process.env.LOGIN_RATE_LIMIT_MAX = "5";
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS = "60000";
    delete process.env.LOGIN_RATE_LIMIT_USER_MAX;
    const l = limitsFromEnv();
    expect(l.ipMax).toBe(5);
    expect(l.windowMs).toBe(60_000);
    expect(l.userMax).toBe(10);
  });

  it("falls back to defaults on invalid values", () => {
    process.env.LOGIN_RATE_LIMIT_MAX = "abc";
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS = "-5";
    const l = limitsFromEnv();
    expect(l.ipMax).toBe(DEFAULT_IP_MAX);
    expect(l.windowMs).toBe(DEFAULT_WINDOW_MS);
  });
});

describe("key helpers", () => {
  it("normalizes usernames", () => {
    expect(normalizeUsername("  Admin@RSJAT.CO.ID ")).toBe("admin@rsjat.co.id");
  });

  it("builds deterministic keys", () => {
    expect(ipKey("1.2.3.4")).toBe("ip:1.2.3.4");
    expect(userKey("Admin")).toBe("user:admin");
  });
});

describe("clientIpFromHeaders()", () => {
  it("prefers x-vercel-forwarded-for", () => {
    const h = new Headers({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "10.0.0.1",
    });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.7");
  });

  it("falls back to the first x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.9");
  });

  it("uses x-real-ip when forwarded headers are absent", () => {
    const h = new Headers({ "x-real-ip": "198.51.100.5" });
    expect(clientIpFromHeaders(h)).toBe("198.51.100.5");
  });

  it("returns 'unknown' when no header is present", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});
