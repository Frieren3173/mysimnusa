import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression: `checkPermission` must return the authenticated user even when the
 * permission is NOT held, so API routes can distinguish:
 *   • unauthenticated  → 401 (user === null)
 *   • unauthorized     → 403 (user !== null, authorized === false)
 *
 * A regression here makes every "denied" API call return a misleading 401
 * ("please log in") to already-logged-in accounts.
 */

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUser(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { checkPermission } from "@/lib/authorization";

function userWith(perms: string[], superAdmin = false) {
  const set = new Set(perms);
  return {
    id: "u1",
    roles: superAdmin ? ["SUPER_ADMIN"] : ["USER"],
    permissions: set,
    hasPermission: (p: string) => set.has(p),
    isSuperAdmin: () => superAdmin,
  };
}

describe("checkPermission", () => {
  beforeEach(() => getCurrentUser.mockReset());

  it("returns user:null when not authenticated (→ 401)", async () => {
    getCurrentUser.mockResolvedValue(null);
    const r = await checkPermission("borang.logbook.create");
    expect(r.user).toBeNull();
    expect(r.authorized).toBe(false);
  });

  it("returns the user with authorized:false when lacking the permission (→ 403)", async () => {
    getCurrentUser.mockResolvedValue(userWith([]));
    const r = await checkPermission("borang.karu.review");
    expect(r.user).not.toBeNull();
    expect(r.authorized).toBe(false);
  });

  it("returns the user with authorized:true when holding the permission", async () => {
    getCurrentUser.mockResolvedValue(userWith(["borang.karu.review"]));
    const r = await checkPermission("borang.karu.review");
    expect(r.user).not.toBeNull();
    expect(r.authorized).toBe(true);
  });

  it("treats a superadmin as authorized for any permission", async () => {
    getCurrentUser.mockResolvedValue(userWith([], true));
    const r = await checkPermission("admin.users.delete");
    expect(r.authorized).toBe(true);
    expect(r.user).not.toBeNull();
  });
});
