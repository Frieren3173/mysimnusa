import { describe, it, expect } from "vitest";
import {
  trainingStatusLabel,
  isValidDateRange,
  periodToRange,
  attendanceSummary,
  TRAINING_STATUSES,
  PARTICIPANT_STATUSES,
  ATTENDANCE_STATUSES,
} from "@/lib/diklat/shared";

describe("training status helpers", () => {
  it("labels every known status in Indonesian", () => {
    for (const s of TRAINING_STATUSES) {
      expect(trainingStatusLabel(s)).not.toBe(s === "DRAFT" ? "" : s);
      expect(trainingStatusLabel(s)).toBeTruthy();
    }
  });
  it("falls back to the raw value for unknown statuses", () => {
    expect(trainingStatusLabel("WEIRD")).toBe("WEIRD");
  });
  it("exposes the canonical status sets", () => {
    expect(PARTICIPANT_STATUSES).toEqual(["REGISTERED", "CONFIRMED", "CANCELLED"]);
    expect(ATTENDANCE_STATUSES).toEqual(["HADIR", "TIDAK_HADIR", "SAKIT", "IZIN"]);
  });
});

describe("isValidDateRange", () => {
  it("accepts end >= start (same day allowed)", () => {
    expect(isValidDateRange("2026-01-01", "2026-01-01")).toBe(true);
    expect(isValidDateRange("2026-01-01", "2026-01-05")).toBe(true);
  });
  it("rejects end before start", () => {
    expect(isValidDateRange("2026-01-05", "2026-01-01")).toBe(false);
  });
  it("rejects invalid dates", () => {
    expect(isValidDateRange("bogus", "2026-01-01")).toBe(false);
    expect(isValidDateRange("2026-01-01", "nope")).toBe(false);
  });
});

describe("periodToRange", () => {
  it("maps YYYY-MM to an inclusive [from, to) UTC range", () => {
    const r = periodToRange("2026-03");
    expect(r).not.toBeNull();
    expect(r!.from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(r!.to.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
  it("returns null for empty / malformed / out-of-range months", () => {
    expect(periodToRange(null)).toBeNull();
    expect(periodToRange("")).toBeNull();
    expect(periodToRange("2026")).toBeNull();
    expect(periodToRange("2026-13")).toBeNull();
    expect(periodToRange("2026-00")).toBeNull();
  });
  it("handles January and December boundaries", () => {
    expect(periodToRange("2026-01")!.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(periodToRange("2026-12")!.to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("attendanceSummary", () => {
  const ids = ["s1", "s2"];
  it("counts HADIR as attended and everything else as present-but-not-hadir", () => {
    const map = attendanceSummary(
      [
        { staffId: "s1", status: "HADIR" },
        { staffId: "s1", status: "IZIN" },
        { staffId: "s2", status: "HADIR" },
      ],
      ids,
    );
    expect(map.get("s1")).toEqual({ hadir: 1, total: 2, rate: 50 });
    expect(map.get("s2")).toEqual({ hadir: 1, total: 1, rate: 100 });
  });
  it("returns zero-rate entries for staff with no records", () => {
    const map = attendanceSummary([], ids);
    expect(map.get("s1")).toEqual({ hadir: 0, total: 0, rate: 0 });
  });
  it("ignores records for staff outside the provided id set", () => {
    const map = attendanceSummary([{ staffId: "x", status: "HADIR" }], ids);
    expect(map.has("x")).toBe(false);
  });
});
