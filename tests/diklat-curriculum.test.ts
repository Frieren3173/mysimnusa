import { describe, it, expect } from "vitest";
import { CURRICULUM_STATUSES, CURRICULUM_STATUS_LABELS, curriculumStatusLabel } from "@/lib/diklat/shared";

describe("curriculum statuses", () => {
  it("exposes the 5 canonical statuses", () => {
    expect(CURRICULUM_STATUSES).toEqual(["DIRANCANG", "TERJADWAL", "BERLANGSUNG", "SELESAI", "DIBATALKAN"]);
  });
  it("labels every status in Indonesian", () => {
    for (const s of CURRICULUM_STATUSES) {
      expect(CURRICULUM_STATUS_LABELS[s]).toBeTruthy();
      expect(curriculumStatusLabel(s)).toBe(CURRICULUM_STATUS_LABELS[s]);
    }
  });
  it("falls back to the raw value for unknown statuses", () => {
    expect(curriculumStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});
