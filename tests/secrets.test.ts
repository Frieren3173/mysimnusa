import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * AUTH_SECRET validation behaviour.
 *
 * The module reads env lazily, so we reset the module registry per test and
 * re-import after mutating process.env.
 */
async function loadSecrets() {
  vi.resetModules();
  return import("@/lib/secrets");
}

/** NODE_ENV is read-only in @types/node, so set it via a cast. */
function setNodeEnv(value: string) {
  (process.env as Record<string, string>).NODE_ENV = value;
}

const ORIGINAL_ENV = { ...process.env };

describe("secrets.authSecret()", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns a sufficiently long AUTH_SECRET", async () => {
    process.env.AUTH_SECRET = "a".repeat(40);
    delete process.env.NEXT_PHASE;
    setNodeEnv("production");
    const { authSecret } = await loadSecrets();
    expect(authSecret()).toBe("a".repeat(40));
  });

  it("throws in production runtime when AUTH_SECRET is missing", async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXT_PHASE;
    setNodeEnv("production");
    const { authSecret } = await loadSecrets();
    expect(() => authSecret()).toThrow(/AUTH_SECRET/);
  });

  it("throws in production runtime when AUTH_SECRET is too short", async () => {
    process.env.AUTH_SECRET = "short";
    delete process.env.NEXT_PHASE;
    setNodeEnv("production");
    const { authSecret } = await loadSecrets();
    expect(() => authSecret()).toThrow(/minimal 32/);
  });

  it("does NOT throw during the production build phase", async () => {
    delete process.env.AUTH_SECRET;
    process.env.NEXT_PHASE = "phase-production-build";
    setNodeEnv("production");
    const { authSecret } = await loadSecrets();
    expect(() => authSecret()).not.toThrow();
  });

  it("falls back to the dev secret outside production", async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXT_PHASE;
    setNodeEnv("development");
    const { authSecret, SECRET_CONSTANTS } = await loadSecrets();
    expect(authSecret()).toBe(SECRET_CONSTANTS.DEV_FALLBACK);
  });

  it("prefers TOKEN_ENCRYPTION_KEY for token encryption when set", async () => {
    process.env.AUTH_SECRET = "a".repeat(40);
    process.env.TOKEN_ENCRYPTION_KEY = "dedicated-key";
    const { tokenEncryptionSecret, hasDedicatedTokenKey } = await loadSecrets();
    expect(tokenEncryptionSecret()).toBe("dedicated-key");
    expect(hasDedicatedTokenKey()).toBe(true);
  });

  it("derives the token key from AUTH_SECRET when no dedicated key", async () => {
    process.env.AUTH_SECRET = "b".repeat(40);
    delete process.env.TOKEN_ENCRYPTION_KEY;
    const { tokenEncryptionSecret, hasDedicatedTokenKey } = await loadSecrets();
    expect(tokenEncryptionSecret()).toBe("b".repeat(40));
    expect(hasDedicatedTokenKey()).toBe(false);
  });
});
