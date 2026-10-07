import { describe, it, expect } from "vitest";
import {
  roleChangeViolation,
  deactivationViolation,
  deletionViolation,
  isSuperAdminTarget,
} from "@/lib/user-admin-guards";

const actor = (id: string) => ({ id, isSuperAdmin: () => false });

describe("isSuperAdminTarget", () => {
  it("detects the SUPER_ADMIN role", () => {
    expect(isSuperAdminTarget({ id: "u1", isActive: true, roles: ["SUPER_ADMIN"] })).toBe(true);
    expect(isSuperAdminTarget({ id: "u1", isActive: true, roles: ["STAFF"] })).toBe(false);
  });
});

describe("roleChangeViolation", () => {
  it("blocks changing your own roles (self-escalation)", () => {
    const v = roleChangeViolation(
      actor("u1"),
      { id: "u1", isActive: true, roles: ["STAFF"] },
      ["SUPER_ADMIN"],
      3,
    );
    expect(v?.code).toBe("SELF_ROLE_CHANGE");
  });

  it("blocks demoting the last SUPER_ADMIN", () => {
    const v = roleChangeViolation(
      actor("admin2"),
      { id: "u2", isActive: true, roles: ["SUPER_ADMIN"] },
      ["STAFF"],
      1,
    );
    expect(v?.code).toBe("LAST_SUPER_ADMIN");
  });

  it("allows demoting a SUPER_ADMIN when others remain", () => {
    const v = roleChangeViolation(
      actor("admin2"),
      { id: "u2", isActive: true, roles: ["SUPER_ADMIN"] },
      ["STAFF"],
      2,
    );
    expect(v).toBeNull();
  });

  it("allows changing roles of a non-super-admin", () => {
    const v = roleChangeViolation(
      actor("admin2"),
      { id: "u3", isActive: true, roles: ["STAFF"] },
      ["ADMIN_BORANG"],
      1,
    );
    expect(v).toBeNull();
  });
});

describe("deactivationViolation", () => {
  it("blocks self-deactivation", () => {
    const v = deactivationViolation(actor("u1"), { id: "u1", isActive: true, roles: ["STAFF"] }, 2);
    expect(v?.code).toBe("SELF_ACTION");
  });

  it("blocks deactivating the last SUPER_ADMIN", () => {
    const v = deactivationViolation(
      actor("admin2"),
      { id: "u2", isActive: true, roles: ["SUPER_ADMIN"] },
      1,
    );
    expect(v?.code).toBe("LAST_SUPER_ADMIN");
  });

  it("allows deactivating a regular user", () => {
    const v = deactivationViolation(actor("admin2"), { id: "u3", isActive: true, roles: ["STAFF"] }, 1);
    expect(v).toBeNull();
  });
});

describe("deletionViolation", () => {
  it("blocks deleting yourself", () => {
    const v = deletionViolation(actor("u1"), { id: "u1", isActive: true, roles: ["STAFF"] }, 2);
    expect(v?.code).toBe("SELF_ACTION");
  });

  it("blocks deleting the last SUPER_ADMIN", () => {
    const v = deletionViolation(
      actor("admin2"),
      { id: "u2", isActive: true, roles: ["SUPER_ADMIN"] },
      1,
    );
    expect(v?.code).toBe("LAST_SUPER_ADMIN");
  });

  it("allows deleting another regular user", () => {
    const v = deletionViolation(actor("admin2"), { id: "u9", isActive: true, roles: ["STAFF"] }, 1);
    expect(v).toBeNull();
  });
});
