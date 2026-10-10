import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFakePrisma, PrismaUniqueError } from "./helpers/fake-db";
import { authState, setCurrentUser, SUPERADMIN, jsonRequest, ctx, readResponse } from "./helpers/route-harness";

/**
 * C2 — attendance uniqueness: the route UPSERTS on (training, staff, date) and
 * the underlying unique constraint is enforced (a direct duplicate insert
 * raises P2002). C3 — capacity: CANCELLED participants do not consume an active
 * slot, a full quota is rejected, and error classification maps ONLY a
 * [trainingId, staffId] unique violation to ALREADY_REGISTERED — never other
 * failures.
 */

vi.mock("@/lib/prisma", async () => {
  const { getFakePrisma } = await import("./helpers/fake-db");
  return { prisma: getFakePrisma().client };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => authState.current }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined), clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/logger", () => ({
  logServerError: vi.fn(),
  safeErrorMessage: (c: string) => `Terjadi kesalahan (${c})`,
}));

import { POST as ATTENDANCE } from "@/server/api/diklat-trainings-$id$-attendance";
import { POST as ADD_PARTICIPANT } from "@/server/api/diklat-trainings-$id$-participants";

const fake = getFakePrisma();

beforeEach(() => {
  for (const m of Object.values(fake.models)) m.rows = [];
  setCurrentUser(SUPERADMIN());
});

// ─────────────────────────────── C2 ───────────────────────────────
describe("C2 — attendance uniqueness (upsert + constraint)", () => {
  beforeEach(async () => {
    await fake.models.training.create({ data: { id: "trC2", title: "C2", status: "COMPLETED" } });
    await fake.models.participants.create({ data: { trainingId: "trC2", staffId: "stf1", status: "CONFIRMED" } });
  });

  it("upserts: two writes for the same (training, staff, date) keep ONE row", async () => {
    await ATTENDANCE(jsonRequest("/x", { staffId: "stf1", date: "2026-08-05", status: "HADIR" }), ctx("trC2"));
    await ATTENDANCE(jsonRequest("/x", { staffId: "stf1", date: "2026-08-05", status: "TIDAK_HADIR" }), ctx("trC2"));
    const rows = fake.models.attendance.rows;
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("TIDAK_HADIR");
  });

  it("the underlying unique constraint is ENFORCED on a direct duplicate insert", async () => {
    const date = new Date("2026-08-05T00:00:00.000Z");
    await fake.models.attendance.create({ data: { trainingId: "trC2", staffId: "stf1", date, status: "HADIR" } });
    await expect(
      fake.models.attendance.create({ data: { trainingId: "trC2", staffId: "stf1", date, status: "SAKIT" } }),
    ).rejects.toBeInstanceOf(PrismaUniqueError);
    expect(fake.models.attendance.rows.length).toBe(1);
  });

  it("different dates for the same participant create DISTINCT rows", async () => {
    await ATTENDANCE(jsonRequest("/x", { staffId: "stf1", date: "2026-08-05", status: "HADIR" }), ctx("trC2"));
    await ATTENDANCE(jsonRequest("/x", { staffId: "stf1", date: "2026-08-06", status: "HADIR" }), ctx("trC2"));
    expect(fake.models.attendance.rows.length).toBe(2);
  });

  it("normalises dates to UTC midnight so equivalent days collide (upsert), not duplicate", async () => {
    // Two ISO strings that are the same calendar day but different times.
    await ATTENDANCE(jsonRequest("/x", { staffId: "stf1", date: "2026-08-07T08:00:00.000Z", status: "HADIR" }), ctx("trC2"));
    await ATTENDANCE(jsonRequest("/x", { staffId: "stf1", date: "2026-08-07T20:00:00.000Z", status: "SAKIT" }), ctx("trC2"));
    expect(fake.models.attendance.rows.length).toBe(1);
  });
});

// ─────────────────────────────── C3 ───────────────────────────────
describe("C3 — capacity excludes CANCELLED + error classification", () => {
  async function seed(staffIds: string[]) {
    for (const id of staffIds) {
      await fake.models.staff.create({ data: { id, name: `S ${id}` } });
    }
  }

  it("a CANCELLED participant does NOT consume an active slot", async () => {
    await fake.models.training.create({ data: { id: "trC3", title: "C3", status: "COMPLETED", capacity: 2 } });
    await fake.models.participants.create({ data: { trainingId: "trC3", staffId: "c1", status: "CANCELLED" } });
    await fake.models.participants.create({ data: { trainingId: "trC3", staffId: "c2", status: "CONFIRMED" } });
    await seed(["c3"]);

    const res = await ADD_PARTICIPANT(jsonRequest("/x", { staffId: "c3" }), ctx("trC3"));
    expect(res.status).toBe(200); // 1 active + this = 2 ≤ capacity 2
    const active = fake.models.participants.rows.filter((r) => r.status !== "CANCELLED");
    expect(active.length).toBe(2);
  });

  it("rejects adding when the active quota is FULL (409 CAPACITY_FULL)", async () => {
    await fake.models.training.create({ data: { id: "trFull", title: "Full", status: "COMPLETED", capacity: 1 } });
    await fake.models.participants.create({ data: { trainingId: "trFull", staffId: "x1", status: "CONFIRMED" } });
    await seed(["x2"]);
    const res = await ADD_PARTICIPANT(jsonRequest("/x", { staffId: "x2" }), ctx("trFull"));
    const body = await readResponse(res);
    expect(res.status).toBe(409);
    expect(body.error?.code).toBe("CAPACITY_FULL");
    expect(fake.models.participants.rows.length).toBe(1);
  });

  it("maps a [trainingId, staffId] unique violation to ALREADY_REGISTERED (409)", async () => {
    await fake.models.training.create({ data: { id: "trDup", title: "Dup", status: "COMPLETED" } });
    await fake.models.participants.create({ data: { trainingId: "trDup", staffId: "d1", status: "CONFIRMED" } });
    await seed(["d1"]);
    const res = await ADD_PARTICIPANT(jsonRequest("/x", { staffId: "d1" }), ctx("trDup"));
    const body = await readResponse(res);
    expect(res.status).toBe(409);
    expect(body.error?.code).toBe("ALREADY_REGISTERED");
  });

  it("does NOT mislabel an unrelated DB failure as a duplicate (500, not 409)", async () => {
    await fake.models.training.create({ data: { id: "trErr", title: "Err", status: "COMPLETED" } });
    await seed(["e1"]);
    // Simulate an infrastructure failure inside the transaction.
    const spy = vi
      .spyOn(fake.models.participants, "create")
      .mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "ECONNRESET" }));
    const res = await ADD_PARTICIPANT(jsonRequest("/x", { staffId: "e1" }), ctx("trErr"));
    const body = await readResponse(res);
    expect(res.status).toBe(500);
    expect(body.error?.code).not.toBe("ALREADY_REGISTERED");
    spy.mockRestore();
  });

  it("does NOT mislabel a P2002 on a DIFFERENT constraint as a duplicate participant", async () => {
    await fake.models.training.create({ data: { id: "trOther", title: "Other", status: "COMPLETED" } });
    await seed(["o1"]);
    // A unique violation whose reported target is NOT [trainingId, staffId].
    const otherUnique = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["someOtherField"] },
    });
    const spy = vi.spyOn(fake.models.participants, "create").mockRejectedValueOnce(otherUnique);
    const res = await ADD_PARTICIPANT(jsonRequest("/x", { staffId: "o1" }), ctx("trOther"));
    const body = await readResponse(res);
    expect(body.error?.code).not.toBe("ALREADY_REGISTERED");
    spy.mockRestore();
  });

  it("maps a write conflict (P2034) to a retryable CONFLICT (409)", async () => {
    await fake.models.training.create({ data: { id: "trWc", title: "WC", status: "COMPLETED" } });
    await seed(["w1"]);
    const conflict = Object.assign(new Error("write conflict"), { code: "P2034" });
    const spy = vi.spyOn(fake.models.participants, "create").mockRejectedValueOnce(conflict);
    const res = await ADD_PARTICIPANT(jsonRequest("/x", { staffId: "w1" }), ctx("trWc"));
    const body = await readResponse(res);
    expect(res.status).toBe(409);
    expect(body.error?.code).toBe("CONFLICT");
    spy.mockRestore();
  });
});
