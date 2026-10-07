import { describe, it, expect } from "vitest";
import { TRANSITIONS } from "@/server/api/borang-entries-$id$-workflow";
import { PERMISSIONS } from "@/lib/constants";

/**
 * Workflow state-machine contract. These assertions lock the allowed
 * transitions and their required permissions so a refactor cannot silently
 * loosen the approval flow.
 */
describe("Borang workflow transitions", () => {
  it("defines the expected actions", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual(
      ["APPROVE", "ARCHIVE", "REJECT", "SUBMIT", "VERIFY"].sort(),
    );
  });

  it("SUBMIT goes DRAFT/REJECTED -> SUBMITTED", () => {
    expect(TRANSITIONS.SUBMIT.from).toEqual(["DRAFT", "REJECTED"]);
    expect(TRANSITIONS.SUBMIT.to).toBe("SUBMITTED");
    expect(TRANSITIONS.SUBMIT.permission).toBe(PERMISSIONS.BORANG_LOGBOOK_SUBMIT);
  });

  it("VERIFY goes SUBMITTED -> VERIFICATION", () => {
    expect(TRANSITIONS.VERIFY.from).toEqual(["SUBMITTED"]);
    expect(TRANSITIONS.VERIFY.to).toBe("VERIFICATION");
    expect(TRANSITIONS.VERIFY.permission).toBe(PERMISSIONS.BORANG_LOGBOOK_VERIFY);
  });

  it("APPROVE only from VERIFICATION", () => {
    expect(TRANSITIONS.APPROVE.from).toEqual(["VERIFICATION"]);
    expect(TRANSITIONS.APPROVE.to).toBe("APPROVED");
  });

  it("REJECT only from SUBMITTED/VERIFICATION", () => {
    expect(TRANSITIONS.REJECT.from).toEqual(["SUBMITTED", "VERIFICATION"]);
    expect(TRANSITIONS.REJECT.to).toBe("REJECTED");
  });

  it("ARCHIVE only from APPROVED", () => {
    expect(TRANSITIONS.ARCHIVE.from).toEqual(["APPROVED"]);
    expect(TRANSITIONS.ARCHIVE.to).toBe("ARCHIVED");
    expect(TRANSITIONS.ARCHIVE.permission).toBe(PERMISSIONS.BORANG_LOGBOOK_ARCHIVE);
  });

  it("a DRAFT entry cannot be verified or approved directly", () => {
    expect(TRANSITIONS.VERIFY.from).not.toContain("DRAFT");
    expect(TRANSITIONS.APPROVE.from).not.toContain("DRAFT");
  });
});
