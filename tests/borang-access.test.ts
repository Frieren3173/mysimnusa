import { describe, it, expect } from "vitest";
import {
  canActOnBehalf,
  isEntryOwnerOrPrivileged,
  separationOfDutiesViolation,
  isEditableStatus,
  MANAGE_ON_BEHALF_PERMISSIONS,
  visibleStaffForActor,
  canSelectOtherStaff,
} from "@/lib/borang-access";
import { PERMISSIONS } from "@/lib/constants";

function actor(opts: {
  id?: string;
  staffId?: string | null;
  perms?: string[];
  superAdmin?: boolean;
}) {
  const perms = new Set(opts.perms ?? []);
  return {
    id: opts.id ?? "u1",
    staff: opts.staffId ? { id: opts.staffId } : null,
    hasPermission: (p: string) => perms.has(p),
    isSuperAdmin: () => Boolean(opts.superAdmin),
  };
}

describe("canActOnBehalf", () => {
  it("is false for a plain user", () => {
    expect(canActOnBehalf(actor({ perms: [] }))).toBe(false);
  });

  it("is true when holding a manage-on-behalf permission", () => {
    expect(
      canActOnBehalf(actor({ perms: [PERMISSIONS.BORANG_LOGBOOK_VERIFY] })),
    ).toBe(true);
    expect(
      canActOnBehalf(actor({ perms: [PERMISSIONS.ADMIN_SETTINGS] })),
    ).toBe(true);
  });
});

describe("isEntryOwnerOrPrivileged", () => {
  const entry = { createdById: "u1", staffId: "s1" };

  it("allows the creator", () => {
    expect(isEntryOwnerOrPrivileged(actor({ id: "u1" }), entry)).toBe(true);
  });

  it("allows the matching staff owner", () => {
    expect(
      isEntryOwnerOrPrivileged(actor({ id: "u9", staffId: "s1" }), entry),
    ).toBe(true);
  });

  it("denies an unrelated plain user", () => {
    expect(
      isEntryOwnerOrPrivileged(actor({ id: "u9", staffId: "s2" }), entry),
    ).toBe(false);
  });

  it("allows privileged users on others' entries", () => {
    expect(
      isEntryOwnerOrPrivileged(
        actor({ id: "u9", perms: [PERMISSIONS.BORANG_LOGBOOK_ARCHIVE] }),
        entry,
      ),
    ).toBe(true);
  });

  it("keeps legacy entries (no owner) editable", () => {
    expect(
      isEntryOwnerOrPrivileged(actor({ id: "u9" }), {
        createdById: null,
        staffId: "s1",
      }),
    ).toBe(true);
  });
});

describe("separationOfDutiesViolation", () => {
  const entry = { createdById: "creator", staffId: "s-creator", verifierId: null };

  it("blocks the creator from verifying", () => {
    const v = separationOfDutiesViolation(actor({ id: "creator" }), entry, "VERIFY");
    expect(v).toMatch(/memverifikasi/);
  });

  it("blocks the owning staff from approving", () => {
    const v = separationOfDutiesViolation(
      actor({ id: "other", staffId: "s-creator" }),
      entry,
      "APPROVE",
    );
    expect(v).toMatch(/menyetujui/);
  });

  it("allows a different verifier", () => {
    expect(
      separationOfDutiesViolation(actor({ id: "verifier" }), entry, "VERIFY"),
    ).toBeNull();
  });

  it("blocks an approver who is also the verifier", () => {
    const v = separationOfDutiesViolation(
      actor({ id: "verifier" }),
      { ...entry, verifierId: "verifier" },
      "APPROVE",
    );
    expect(v).toMatch(/pemverifikasi/);
  });

  it("allows a distinct approver", () => {
    expect(
      separationOfDutiesViolation(
        actor({ id: "approver" }),
        { ...entry, verifierId: "verifier" },
        "APPROVE",
      ),
    ).toBeNull();
  });

  it("does not treat SUPER_ADMIN as an exemption by default", () => {
    const v = separationOfDutiesViolation(
      actor({ id: "creator", superAdmin: true }),
      entry,
      "VERIFY",
    );
    expect(v).not.toBeNull();
  });
});

describe("isEditableStatus", () => {
  it("allows DRAFT and REJECTED only", () => {
    expect(isEditableStatus("DRAFT")).toBe(true);
    expect(isEditableStatus("REJECTED")).toBe(true);
    expect(isEditableStatus("SUBMITTED")).toBe(false);
    expect(isEditableStatus("APPROVED")).toBe(false);
  });
});

describe("MANAGE_ON_BEHALF_PERMISSIONS", () => {
  it("includes verify / approve / archive / admin settings", () => {
    expect(MANAGE_ON_BEHALF_PERMISSIONS).toContain(PERMISSIONS.BORANG_LOGBOOK_VERIFY);
    expect(MANAGE_ON_BEHALF_PERMISSIONS).toContain(PERMISSIONS.BORANG_LOGBOOK_APPROVE);
    expect(MANAGE_ON_BEHALF_PERMISSIONS).toContain(PERMISSIONS.BORANG_LOGBOOK_ARCHIVE);
    expect(MANAGE_ON_BEHALF_PERMISSIONS).toContain(PERMISSIONS.ADMIN_SETTINGS);
  });
});

const ALL_STAFF = [
  { id: "s1", name: "Alice" },
  { id: "s2", name: "Bob" },
  { id: "s3", name: "Carol" },
];

describe("visibleStaffForActor (staff dropdown filtering)", () => {
  it("returns the full list for privileged actors", () => {
    const a = actor({ id: "u1", staffId: "s2", perms: [PERMISSIONS.BORANG_LOGBOOK_VERIFY] });
    expect(visibleStaffForActor(a, ALL_STAFF)).toHaveLength(3);
  });

  it("returns the full list for admin-settings holders", () => {
    const a = actor({ id: "u1", perms: [PERMISSIONS.ADMIN_SETTINGS] });
    expect(visibleStaffForActor(a, ALL_STAFF)).toHaveLength(3);
  });

  it("returns only the actor's own staff row for a plain user", () => {
    const a = actor({ id: "u1", staffId: "s2" });
    const result = visibleStaffForActor(a, ALL_STAFF);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s2");
  });

  it("returns an empty list for a plain user with no linked staff", () => {
    const a = actor({ id: "u1", staffId: null });
    expect(visibleStaffForActor(a, ALL_STAFF)).toHaveLength(0);
  });

  it("never leaks other staff to a plain user even if present in the source", () => {
    const a = actor({ id: "u1", staffId: "s1" });
    const ids = visibleStaffForActor(a, ALL_STAFF).map((s) => s.id);
    expect(ids).toEqual(["s1"]);
    expect(ids).not.toContain("s2");
  });
});

describe("canSelectOtherStaff", () => {
  it("is false for a plain user and true for privileged actors", () => {
    expect(canSelectOtherStaff(actor({ id: "u1", staffId: "s1" }))).toBe(false);
    expect(
      canSelectOtherStaff(actor({ id: "u1", perms: [PERMISSIONS.BORANG_LOGBOOK_APPROVE] })),
    ).toBe(true);
  });
});
