import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFakePrisma } from "./helpers/fake-db";
import { authState, setCurrentUser, SUPERADMIN } from "./helpers/route-harness";

/**
 * FINAL BUSINESS RULE — binary attendance & JPL.
 *   ≥1 HADIR (valid) → FULL activity JPL. No percentage, no pro-rata, no
 *   per-session split. SAKIT/IZIN/TIDAK_HADIR alone → 0. CANCELLED activity or
 *   CANCELLED participant → 0. Duplicate HADIR rows must NOT double-count.
 */

vi.mock("@/lib/prisma", async () => {
  const { getFakePrisma } = await import("./helpers/fake-db");
  return { prisma: getFakePrisma().client };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => authState.current }));

import { getJplRows, summarizeJpl, earnsJpl, ANNUAL_JPL_TARGET, JPL_PRESENT_STATUSES } from "@/lib/diklat/jpl";
import { getStaffHistory } from "@/lib/diklat/history";

const fake = getFakePrisma();

function reset() {
  for (const m of Object.values(fake.models)) m.rows = [];
}

async function mkStaff(id = "s1") {
  await fake.models.staff.create({ data: { id, name: `Staf ${id}`, nip: id, profession: "Perawat", isActive: true } });
}
async function mkTraining(id: string, jpl: number, status = "COMPLETED") {
  await fake.models.training.create({
    data: {
      id,
      title: `T ${id}`,
      status,
      jpl,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-05T00:00:00.000Z"),
    },
  });
}
async function mkParticipant(trainingId: string, staffId: string, status = "CONFIRMED") {
  await fake.models.participants.create({ data: { trainingId, staffId, status } });
}
async function mkAttendance(trainingId: string, staffId: string, status: string, day = "2026-03-01") {
  await fake.models.attendance.create({
    data: { trainingId, staffId, date: new Date(`${day}T00:00:00.000Z`), status },
  });
}

beforeEach(() => {
  reset();
  setCurrentUser(SUPERADMIN());
});

describe("JPL — binary attendance rule", () => {
  it("one HADIR on an 8-JPL activity yields exactly 8 JPL", async () => {
    await mkStaff();
    await mkTraining("t8", 8);
    await mkParticipant("t8", "s1");
    await mkAttendance("t8", "s1", "HADIR");
    const rows = await getJplRows({ year: 2026 });
    expect(rows.find((r) => r.staffId === "s1")?.totalJpl).toBe(8);
  });

  it("one HADIR on a 20-JPL activity yields exactly 20 JPL", async () => {
    await mkStaff();
    await mkTraining("t20", 20);
    await mkParticipant("t20", "s1");
    await mkAttendance("t20", "s1", "HADIR");
    const rows = await getJplRows({ year: 2026 });
    const r = rows.find((x) => x.staffId === "s1");
    expect(r?.totalJpl).toBe(20);
    expect(r?.met).toBe(true); // 20 >= target
  });

  it("several HADIR rows on the SAME activity do NOT multiply the JPL", async () => {
    await mkStaff();
    await mkTraining("t5", 5);
    await mkParticipant("t5", "s1");
    await mkAttendance("t5", "s1", "HADIR", "2026-03-01");
    await mkAttendance("t5", "s1", "HADIR", "2026-03-02");
    await mkAttendance("t5", "s1", "HADIR", "2026-03-03");
    const rows = await getJplRows({ year: 2026 });
    expect(rows.find((r) => r.staffId === "s1")?.totalJpl).toBe(5); // once, not 15
  });

  it("no HADIR (no records) yields 0 JPL", async () => {
    await mkStaff();
    await mkTraining("t4", 4);
    await mkParticipant("t4", "s1");
    const rows = await getJplRows({ year: 2026 });
    expect(rows.find((r) => r.staffId === "s1")?.totalJpl).toBe(0);
  });

  it("SAKIT/IZIN/TIDAK_HADIR alone yields 0 JPL", async () => {
    await mkStaff();
    await mkTraining("t6", 6);
    await mkParticipant("t6", "s1");
    await mkAttendance("t6", "s1", "SAKIT", "2026-03-01");
    await mkAttendance("t6", "s1", "IZIN", "2026-03-02");
    await mkAttendance("t6", "s1", "TIDAK_HADIR", "2026-03-03");
    const rows = await getJplRows({ year: 2026 });
    expect(rows.find((r) => r.staffId === "s1")?.totalJpl).toBe(0);
  });

  it("a CANCELLED activity yields 0 JPL even with HADIR", async () => {
    await mkStaff();
    await mkTraining("tc", 10, "CANCELLED");
    await mkParticipant("tc", "s1");
    await mkAttendance("tc", "s1", "HADIR");
    const rows = await getJplRows({ year: 2026 });
    expect(rows.find((r) => r.staffId === "s1")?.totalJpl).toBe(0);
  });

  it("a CANCELLED participant yields 0 JPL even with a stray HADIR", async () => {
    await mkStaff();
    await mkTraining("tp", 10);
    await mkParticipant("tp", "s1", "CANCELLED");
    await mkAttendance("tp", "s1", "HADIR");
    const rows = await getJplRows({ year: 2026 });
    expect(rows.find((r) => r.staffId === "s1")?.totalJpl).toBe(0);
  });

  it("sums DISTINCT activities (no double count across activities)", async () => {
    await mkStaff();
    await mkTraining("a", 6);
    await mkTraining("b", 4);
    await mkParticipant("a", "s1");
    await mkParticipant("b", "s1");
    await mkAttendance("a", "s1", "HADIR");
    await mkAttendance("b", "s1", "HADIR");
    const rows = await getJplRows({ year: 2026 });
    expect(rows.find((r) => r.staffId === "s1")?.totalJpl).toBe(10);
  });

  it("keeps the annual target at 20 JPL", () => {
    expect(ANNUAL_JPL_TARGET).toBe(20);
  });

  it("only HADIR is a credit-earning status", () => {
    expect([...JPL_PRESENT_STATUSES]).toEqual(["HADIR"]);
  });
});

describe("JPL — pure rule earnsJpl (binary)", () => {
  it("full weight when present and not cancelled", () => {
    expect(earnsJpl({ attendedPresent: true, participantCancelled: false, activityCancelled: false, activityJpl: 8 })).toBe(true);
  });
  it("false when not present", () => {
    expect(earnsJpl({ attendedPresent: false, participantCancelled: false, activityCancelled: false, activityJpl: 8 })).toBe(false);
  });
  it("false when activity cancelled", () => {
    expect(earnsJpl({ attendedPresent: true, participantCancelled: false, activityCancelled: true, activityJpl: 8 })).toBe(false);
  });
  it("false when participant cancelled", () => {
    expect(earnsJpl({ attendedPresent: true, participantCancelled: true, activityCancelled: false, activityJpl: 8 })).toBe(false);
  });
  it("false when activity has no JPL weight", () => {
    expect(earnsJpl({ attendedPresent: true, participantCancelled: false, activityCancelled: false, activityJpl: null })).toBe(false);
    expect(earnsJpl({ attendedPresent: true, participantCancelled: false, activityCancelled: false, activityJpl: 0 })).toBe(false);
  });
});

describe("JPL — dashboard summary consistency", () => {
  it("summary totals equal the sum of the per-staff rows (same source)", async () => {
    await mkStaff("s1");
    await mkStaff("s2");
    await mkTraining("x", 8);
    await mkParticipant("x", "s1");
    await mkAttendance("x", "s1", "HADIR");
    const rows = await getJplRows({ year: 2026 });
    const summary = summarizeJpl(rows);
    expect(summary.totalJpl).toBe(rows.reduce((a, r) => a + r.totalJpl, 0));
    expect(summary.totalJpl).toBe(8);
    expect(summary.staffCount).toBe(2); // s2 included with 0
  });
});

describe("JPL — dashboard, history and export agree", () => {
  it("dashboard total equals the staff-history total for the same year", async () => {
    await mkStaff("s1");
    await mkStaff("s2");
    await mkTraining("a", 6);
    await mkTraining("b", 14);
    await mkParticipant("a", "s1");
    await mkParticipant("b", "s1");
    await mkAttendance("a", "s1", "HADIR");
    await mkAttendance("b", "s1", "HADIR");
    await mkParticipant("a", "s2"); // registered but no HADIR → 0

    const dashboard = summarizeJpl(await getJplRows({ year: 2026 }));
    const history = await getStaffHistory("s1", 2026);
    expect(history).not.toBeNull();
    expect(history!.totalJpl).toBe(20);
    // Dashboard total = sum over all staff; history is just s1 here.
    expect(history!.totalJpl).toBe(20);
    expect(dashboard.totalJpl).toBe(20);
    expect(history!.qualifyingActivities).toBe(2);
  });

  it("history marks a single HADIR as attended with the activity's FULL JPL", async () => {
    await mkStaff("s1");
    await mkTraining("w", 12);
    await mkParticipant("w", "s1");
    await mkAttendance("w", "s1", "HADIR");
    await mkAttendance("w", "s1", "SAKIT", "2026-03-05"); // extra day, must not change JPL
    const history = await getStaffHistory("s1", 2026);
    const item = history!.items.find((i) => i.trainingId === "w");
    expect(item?.attended).toBe(true);
    expect(item?.jplEarned).toBe(12);
  });

  it("history does not grant JPL for a CANCELLED activity or CANCELLED participant", async () => {
    await mkStaff("s1");
    await mkTraining("c1", 7, "CANCELLED");
    await mkParticipant("c1", "s1");
    await mkAttendance("c1", "s1", "HADIR");
    await mkTraining("c2", 7);
    await mkParticipant("c2", "s1", "CANCELLED");
    await mkAttendance("c2", "s1", "HADIR");
    const history = await getStaffHistory("s1", 2026);
    expect(history!.totalJpl).toBe(0);
    expect(history!.items.every((i) => i.jplEarned === 0)).toBe(true);
  });
});
