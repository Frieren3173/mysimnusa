import { describe, it, expect } from "vitest";
import {
  prismaErrorCode,
  isWriteConflict,
  uniqueTargetFields,
  isUniqueViolationOn,
} from "@/lib/diklat/prisma-errors";

/**
 * D — Prisma error classification. These functions decide whether a failure is
 * a "participant already registered" duplicate. A mistake here either (a) hides
 * a real DB error behind a bogus "duplicate" message, or (b) fails to report a
 * genuine duplicate. Both are regressions, so every category is pinned here.
 */

describe("prisma-errors", () => {
  it("reads the error code", () => {
    expect(prismaErrorCode({ code: "P2002" })).toBe("P2002");
    expect(prismaErrorCode(new Error("x"))).toBeNull();
    expect(prismaErrorCode(null)).toBeNull();
    expect(prismaErrorCode("nope")).toBeNull();
  });

  it("detects write conflicts (P2034) only", () => {
    expect(isWriteConflict({ code: "P2034" })).toBe(true);
    expect(isWriteConflict({ code: "P2002" })).toBe(false);
    expect(isWriteConflict(new Error("x"))).toBe(false);
  });

  it("normalises meta.target from an array of field names", () => {
    expect(uniqueTargetFields({ meta: { target: ["trainingId", "staffId"] } })).toEqual([
      "trainingId",
      "staffId",
    ]);
  });

  it("normalises meta.target from a constraint name string", () => {
    expect(uniqueTargetFields({ meta: { target: "trainingId_staffId_key" } })).toEqual([
      "trainingId",
      "staffId",
    ]);
  });

  it("returns [] when there is no target information", () => {
    expect(uniqueTargetFields({ code: "P2002" })).toEqual([]);
    expect(uniqueTargetFields({ meta: {} })).toEqual([]);
    expect(uniqueTargetFields(new Error("x"))).toEqual([]);
  });

  describe("isUniqueViolationOn", () => {
    const fields = ["trainingId", "staffId"];

    it("is TRUE for a P2002 on the SAME target (array form)", () => {
      expect(isUniqueViolationOn({ code: "P2002", meta: { target: ["trainingId", "staffId"] } }, fields)).toBe(true);
    });

    it("is TRUE for a P2002 on the SAME target (constraint-name form)", () => {
      expect(isUniqueViolationOn({ code: "P2002", meta: { target: "trainingId_staffId_key" } }, fields)).toBe(true);
    });

    it("is FALSE for a P2002 on a DIFFERENT target", () => {
      expect(isUniqueViolationOn({ code: "P2002", meta: { target: ["certificateNumber"] } }, fields)).toBe(false);
      expect(isUniqueViolationOn({ code: "P2002", meta: { target: ["email_key"] } }, fields)).toBe(false);
    });

    it("is FALSE for a non-unique error code", () => {
      expect(isUniqueViolationOn({ code: "P2003" }, fields)).toBe(false);
      expect(isUniqueViolationOn({ code: "ECONNRESET" }, fields)).toBe(false);
      expect(isUniqueViolationOn(new Error("boom"), fields)).toBe(false);
      expect(isUniqueViolationOn(null, fields)).toBe(false);
    });

    it("treats a P2002 with NO target as matching (single-constraint query)", () => {
      expect(isUniqueViolationOn({ code: "P2002" }, fields)).toBe(true);
    });
  });
});
