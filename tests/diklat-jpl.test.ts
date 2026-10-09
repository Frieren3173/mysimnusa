import { describe, it, expect } from "vitest";
import {
  ANNUAL_JPL_TARGET,
  buildJplRow,
  summarizeJpl,
  JPL_PRESENT_STATUSES,
  type JplRow,
} from "@/lib/diklat/jpl";

/**
 * JPL aggregation rules.
 *
 * The DB query is exercised on staging; here we lock the pure maths + the
 * configurable target so dashboards/history/Excel cannot drift.
 */

function row(over: Partial<JplRow> = {}): JplRow {
  return buildJplRow({
    staffId: "s1",
    staffName: "Ns. Test",
    nip: "123",
    profession: "PERAWAT",
    roomId: "r1",
    roomName: "ICU",
    totalJpl: 0,
    activities: 0,
    ...over,
  });
}

describe("JPL configuration", () => {
  it("targets 20 JPL per calendar year", () => {
    expect(ANNUAL_JPL_TARGET).toBe(20);
  });
  it("only HADIR earns JPL", () => {
    expect(JPL_PRESENT_STATUSES).toEqual(["HADIR"]);
    expect((JPL_PRESENT_STATUSES as readonly string[]).includes("SAKIT")).toBe(false);
    expect((JPL_PRESENT_STATUSES as readonly string[]).includes("IZIN")).toBe(false);
    expect((JPL_PRESENT_STATUSES as readonly string[]).includes("TIDAK_HADIR")).toBe(false);
  });
});

describe("buildJplRow — progress maths", () => {
  it("0 JPL → 0%, not met, remaining = target", () => {
    const r = row({ totalJpl: 0 });
    expect(r.progressPct).toBe(0);
    expect(r.met).toBe(false);
    expect(r.remainingJpl).toBe(20);
  });
  it("exactly the target → met, remaining 0, 100%", () => {
    const r = row({ totalJpl: 20 });
    expect(r.met).toBe(true);
    expect(r.remainingJpl).toBe(0);
    expect(r.progressPct).toBe(100);
  });
  it("above the target → met, remaining floored at 0, % may exceed 100", () => {
    const r = row({ totalJpl: 30 });
    expect(r.met).toBe(true);
    expect(r.remainingJpl).toBe(0);
    expect(r.progressPct).toBe(150); // raw total/progress is NOT capped
  });
  it("remaining never goes negative", () => {
    expect(row({ totalJpl: 25 }).remainingJpl).toBe(0);
  });
  it("partial progress", () => {
    const r = row({ totalJpl: 5 });
    expect(r.progressPct).toBe(25);
    expect(r.remainingJpl).toBe(15);
    expect(r.met).toBe(false);
  });
  it("negative input is clamped to 0", () => {
    expect(row({ totalJpl: -5 }).totalJpl).toBe(0);
  });
});

describe("summarizeJpl", () => {
  const rows = [row({ totalJpl: 20 }), row({ totalJpl: 5, staffId: "s2" }), row({ totalJpl: 0, staffId: "s3" })];
  it("counts met / not met / staff and sums the true total", () => {
    const s = summarizeJpl(rows);
    expect(s.staffCount).toBe(3);
    expect(s.metCount).toBe(1);
    expect(s.notMetCount).toBe(2);
    expect(s.totalJpl).toBe(25);
  });
});
