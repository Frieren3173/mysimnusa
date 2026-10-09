import { describe, it, expect } from "vitest";
import {
  WORKFLOW_TRANSITIONS,
  canTransition,
  requiresNote,
  isUserEditableStatus,
  canReviewAsKaru,
  isSuperAdminRole,
  isKepalaRuangRole,
  isDiklatBorangRole,
  BORANG_STATUS_LABEL,
  BORANG_STATUS_VARIANT,
} from "@/lib/borang-workflow";
import { canAccessBorangEntry, borangListWhere, type BorangScope } from "@/lib/borang-scope";
import { ROLES } from "@/lib/constants";

/**
 * Workflow v1 contract: transitions, role scoping, and the note-required rule.
 * These lock the pengajuan → review → print → complete lifecycle so a refactor
 * cannot silently loosen the Kepala Ruang / sekretariat gating.
 */
describe("Borang workflow v1 transitions", () => {
  it("SUBMIT goes DRAFT/REVISION_REQUIRED/REJECTED -> SUBMITTED", () => {
    expect(WORKFLOW_TRANSITIONS.SUBMIT.from).toEqual(["DRAFT", "REVISION_REQUIRED", "REJECTED"]);
    expect(WORKFLOW_TRANSITIONS.SUBMIT.to).toBe("SUBMITTED");
  });

  it("Kepala Ruang approves SUBMITTED -> APPROVED_KARU", () => {
    expect(WORKFLOW_TRANSITIONS.APPROVE_KARU.from).toEqual(["SUBMITTED"]);
    expect(WORKFLOW_TRANSITIONS.APPROVE_KARU.to).toBe("APPROVED_KARU");
  });

  it("REQUEST_REVISION produces REVISION_REQUIRED and needs a note", () => {
    expect(WORKFLOW_TRANSITIONS.REQUEST_REVISION.to).toBe("REVISION_REQUIRED");
    expect(requiresNote("REQUEST_REVISION")).toBe(true);
  });

  it("secretariat finalises APPROVED_KARU -> READY_TO_PRINT and can request revision", () => {
    expect(WORKFLOW_TRANSITIONS.READY_TO_PRINT.from).toEqual(["APPROVED_KARU"]);
    expect(WORKFLOW_TRANSITIONS.READY_TO_PRINT.to).toBe("READY_TO_PRINT");
    expect(WORKFLOW_TRANSITIONS.ADMIN_REVISION.to).toBe("REVISION_REQUIRED");
    expect(requiresNote("ADMIN_REVISION")).toBe(true);
  });

  it("print then complete chain", () => {
    expect(WORKFLOW_TRANSITIONS.PRINT.from).toEqual(["READY_TO_PRINT"]);
    expect(WORKFLOW_TRANSITIONS.PRINT.to).toBe("PRINTED");
    expect(WORKFLOW_TRANSITIONS.COMPLETE.from).toEqual(["PRINTED"]);
    expect(WORKFLOW_TRANSITIONS.COMPLETE.to).toBe("COMPLETED");
  });

  it("cannot skip steps (no DRAFT -> APPROVED_KARU)", () => {
    expect(canTransition("APPROVE_KARU", "DRAFT")).toBe(false);
    expect(canTransition("PRINT", "APPROVED_KARU")).toBe(false);
    expect(canTransition("COMPLETE", "READY_TO_PRINT")).toBe(false);
  });

  it("a DRAFT can only be submitted", () => {
    expect(canTransition("SUBMIT", "DRAFT")).toBe(true);
    expect(canTransition("READY_TO_PRINT", "DRAFT")).toBe(false);
    expect(canTransition("COMPLETE", "DRAFT")).toBe(false);
  });
});

describe("editable statuses", () => {
  it("allows DRAFT and REVISION_REQUIRED only", () => {
    expect(isUserEditableStatus("DRAFT")).toBe(true);
    expect(isUserEditableStatus("REVISION_REQUIRED")).toBe(true);
    expect(isUserEditableStatus("SUBMITTED")).toBe(false);
    expect(isUserEditableStatus("APPROVED_KARU")).toBe(false);
    expect(isUserEditableStatus("COMPLETED")).toBe(false);
  });
});

describe("role detection", () => {
  it("recognises legacy and business superadmin", () => {
    expect(isSuperAdminRole([ROLES.SUPER_ADMIN])).toBe(true);
    expect(isSuperAdminRole([ROLES.SUPERADMIN])).toBe(true);
    expect(isSuperAdminRole([ROLES.USER])).toBe(false);
  });
  it("recognises Kepala Ruang and DIKLAT_BORANG", () => {
    expect(isKepalaRuangRole([ROLES.KEPALA_RUANG])).toBe(true);
    expect(isDiklatBorangRole([ROLES.DIKLAT_BORANG])).toBe(true);
  });
});

describe("canReviewAsKaru", () => {
  const actor = (id: string, superAdmin = false) => ({
    id,
    roles: [] as string[],
    isSuperAdmin: () => superAdmin,
  });

  it("allows superadmin on any room", () => {
    expect(
      canReviewAsKaru(actor("u1", true), { kepalaRuangUserId: null, roomId: "r9", assignedRoomIds: [] }),
    ).toBe(true);
  });

  it("allows the snapshot reviewer", () => {
    expect(
      canReviewAsKaru(actor("u1"), { kepalaRuangUserId: "u1", roomId: "r1", assignedRoomIds: [] }),
    ).toBe(true);
  });

  it("denies a different Kepala Ruang", () => {
    expect(
      canReviewAsKaru(actor("u2"), { kepalaRuangUserId: "u1", roomId: "r1", assignedRoomIds: ["r2"] }),
    ).toBe(false);
  });

  it("falls back to room assignment before a snapshot exists", () => {
    expect(
      canReviewAsKaru(actor("u2"), { kepalaRuangUserId: null, roomId: "r2", assignedRoomIds: ["r2"] }),
    ).toBe(true);
    expect(
      canReviewAsKaru(actor("u2"), { kepalaRuangUserId: null, roomId: "r3", assignedRoomIds: ["r2"] }),
    ).toBe(false);
  });
});

describe("borang scoping", () => {
  const base: BorangScope = {
    unrestricted: false,
    assignedRoomIds: [],
    staffId: "s1",
    roomId: "r1",
    isKaru: false,
    isSecretariat: false,
    isSuperAdmin: false,
  };

  it("unrestricted actors get no where-clause", () => {
    expect(borangListWhere({ ...base, unrestricted: true }, "u1")).toBeUndefined();
  });

  it("plain user where-clause is limited to own staff/creation", () => {
    const w = borangListWhere(base, "u1") as { OR: unknown[] };
    expect(w.OR).toContainEqual({ staffId: "s1" });
    expect(w.OR).toContainEqual({ createdById: "u1" });
    expect(w.OR).not.toContainEqual({ roomId: { in: ["r1"] } });
  });

  it("Kepala Ruang gets assigned-room visibility", () => {
    const w = borangListWhere({ ...base, isKaru: true, assignedRoomIds: ["r1"] }, "u1") as {
      OR: unknown[];
    };
    expect(w.OR).toContainEqual({ roomId: { in: ["r1"] } });
  });

  it("cross-room access is denied for a plain user", () => {
    const entry = { createdById: "u2", staffId: "s2", roomId: "r9", kepalaRuangUserId: null };
    expect(canAccessBorangEntry(base, "u1", entry)).toBe(false);
  });

  it("owner and same-staff are allowed", () => {
    expect(
      canAccessBorangEntry(base, "u1", { createdById: "u1", staffId: "s9", roomId: "r9", kepalaRuangUserId: null }),
    ).toBe(true);
    expect(
      canAccessBorangEntry(base, "u1", { createdById: null, staffId: "s1", roomId: "r9", kepalaRuangUserId: null }),
    ).toBe(true);
  });

  it("Kepala Ruang may access only assigned-room entries", () => {
    const karu = { ...base, isKaru: true, assignedRoomIds: ["r1"] };
    expect(
      canAccessBorangEntry(karu, "u1", { createdById: "x", staffId: "y", roomId: "r1", kepalaRuangUserId: null }),
    ).toBe(true);
    expect(
      canAccessBorangEntry(karu, "u1", { createdById: "x", staffId: "y", roomId: "r2", kepalaRuangUserId: null }),
    ).toBe(false);
  });
});

describe("status labels", () => {
  it("covers every new status", () => {
    for (const s of ["REVISION_REQUIRED", "APPROVED_KARU", "READY_TO_PRINT", "PRINTED", "COMPLETED"]) {
      expect(BORANG_STATUS_LABEL[s]).toBeTruthy();
      expect(BORANG_STATUS_VARIANT[s]).toBeTruthy();
    }
  });
});
