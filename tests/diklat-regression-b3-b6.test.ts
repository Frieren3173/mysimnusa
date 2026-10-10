import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFakePrisma } from "./helpers/fake-db";
import { authState, setCurrentUser, SUPERADMIN, jsonRequest, ctx } from "./helpers/route-harness";

/**
 * B3/B4/B5/B6 regression — exercised through the REAL route handlers with an
 * in-memory Prisma double that enforces unique constraints.
 *   B3: global-unique certificate numbering (no silent skip, metadata stored).
 *   B4: PATCH date-range validation against the EFFECTIVE (merged) dates.
 *   B5: attendance notes preserved when omitted, cleared on explicit null.
 *   B6: assessment `completed` precedence + grade/score consistency.
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
// Keep REAL numbering helpers; stub only the template + PPTX rendering so the
// test does not touch the filesystem or build a real deck.
vi.mock("@/lib/diklat/certificate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/diklat/certificate")>();
  return {
    ...actual,
    templateExists: () => true,
    renderCertificatePptx: async () => Buffer.from("PK-dummy-pptx"),
  };
});

import { POST as GENERATE } from "@/server/api/diklat-trainings-$id$-certificates-generate";
import { PATCH as TRAINING_PATCH } from "@/server/api/diklat-trainings-$id$";
import { POST as ATTENDANCE } from "@/server/api/diklat-trainings-$id$-attendance";
import { POST as ASSESSMENT } from "@/server/api/diklat-trainings-$id$-assessments";

const fake = getFakePrisma();

beforeEach(() => {
  for (const m of Object.values(fake.models)) m.rows = [];
  setCurrentUser(SUPERADMIN());
});

// ─────────────────────────────── B3 ───────────────────────────────
describe("B3 — global-unique certificate numbering", () => {
  async function seedActivity(id: string, staffId: string) {
    await fake.models.training.create({
      data: { id, title: `Aktivitas ${id}`, status: "COMPLETED", certificateMode: "ATTENDANCE_ONLY", showScore: false },
    });
    await fake.models.staff.create({ data: { id: staffId, name: `Staff ${staffId}`, nip: "123", profession: "Perawat" } });
    await fake.models.participants.create({ data: { trainingId: id, staffId, status: "CONFIRMED" } });
    await fake.models.attendance.create({
      data: { trainingId: id, staffId, date: new Date("2026-08-01T00:00:00.000Z"), status: "HADIR" },
    });
  }

  const genBody = (staffId: string) => ({
    staffIds: [staffId],
    mode: "single" as const,
    tema: "Tema",
    tanggal: "2026-08-15",
    tempat: "Lokasi",
    jpl: 4,
    numberPrefix: "TEST/IHT/",
    numberPattern: "{PREFIX}{SEQ:3}/{MONTH}/{YEAR}",
  });

  it("two activities with the SAME prefix & period get DIFFERENT numbers", async () => {
    await seedActivity("trA", "stf1");
    await seedActivity("trB", "stf1");
    const a = await GENERATE(jsonRequest("/x", genBody("stf1")), ctx("trA"));
    const b = await GENERATE(jsonRequest("/x", genBody("stf1")), ctx("trB"));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const certs = fake.models.certificate.rows;
    expect(certs.length).toBe(2); // no silent skip
    const numbers = certs.map((c) => c.certificateNumber);
    expect(new Set(numbers).size).toBe(2); // globally unique
  });

  it("persists issuance metadata (issuedById + trigger) and does not skip duplicates silently", async () => {
    await seedActivity("trC", "stf1");
    const a = await GENERATE(jsonRequest("/x", genBody("stf1")), ctx("trC"));
    expect(a.status).toBe(200);
    const cert = fake.models.certificate.rows[0];
    expect(cert.issuedById).toBeTruthy();
    expect(cert.trigger).toBe("MANUAL");
  });

  it("reuses an existing number for a participant instead of allocating a new one", async () => {
    await seedActivity("trD", "stf1");
    await GENERATE(jsonRequest("/x", genBody("stf1")), ctx("trD"));
    const first = fake.models.certificate.rows[0].certificateNumber;
    const again = await GENERATE(jsonRequest("/x", genBody("stf1")), ctx("trD"));
    expect(again.status).toBe(200);
    expect(fake.models.certificate.rows.length).toBe(1);
    expect(fake.models.certificate.rows[0].certificateNumber).toBe(first);
  });

  it("refuses to generate for a CANCELLED activity (409) and stores nothing", async () => {
    await fake.models.training.create({
      data: { id: "trX", title: "X", status: "CANCELLED", certificateMode: "ATTENDANCE_ONLY" },
    });
    await fake.models.participants.create({ data: { trainingId: "trX", staffId: "stf1", status: "CONFIRMED" } });
    await fake.models.attendance.create({
      data: { trainingId: "trX", staffId: "stf1", date: new Date("2026-08-01T00:00:00.000Z"), status: "HADIR" },
    });
    const res = await GENERATE(jsonRequest("/x", genBody("stf1")), ctx("trX"));
    expect(res.status).toBe(409);
    expect(fake.models.certificate.rows.length).toBe(0);
  });
});

// ─────────────────────────────── B4 ───────────────────────────────
describe("B4 — PATCH date-range validation (effective dates)", () => {
  beforeEach(async () => {
    await fake.models.training.create({
      data: {
        id: "trRange",
        title: "Range",
        status: "COMPLETED",
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-08-10T00:00:00.000Z"),
      },
    });
  });

  it("rejects endDate before startDate (422)", async () => {
    const res = await TRAINING_PATCH(
      jsonRequest("/x", { startDate: "2026-09-10", endDate: "2026-09-01" }, "PATCH"),
      ctx("trRange"),
    );
    expect(res.status).toBe(422);
  });

  it("rejects editing ONE side so the effective range inverts (422)", async () => {
    // existing endDate = 2026-08-10; moving startDate past it must be rejected.
    const res = await TRAINING_PATCH(jsonRequest("/x", { startDate: "2026-09-20" }, "PATCH"), ctx("trRange"));
    expect(res.status).toBe(422);
  });

  it("accepts a valid range (200)", async () => {
    const res = await TRAINING_PATCH(
      jsonRequest("/x", { startDate: "2026-07-01", endDate: "2026-07-05" }, "PATCH"),
      ctx("trRange"),
    );
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────── B5 ───────────────────────────────
describe("B5 — attendance notes handling", () => {
  beforeEach(async () => {
    await fake.models.training.create({ data: { id: "trAtt", title: "Att", status: "COMPLETED" } });
    await fake.models.participants.create({ data: { trainingId: "trAtt", staffId: "stf1", status: "CONFIRMED" } });
  });

  it("creates a record with notes, then PRESERVES notes when an update omits them", async () => {
    await ATTENDANCE(
      jsonRequest("/x", { staffId: "stf1", date: "2026-08-01", status: "HADIR", notes: "catatan awal" }),
      ctx("trAtt"),
    );
    await ATTENDANCE(
      jsonRequest("/x", { staffId: "stf1", date: "2026-08-01", status: "SAKIT" }),
      ctx("trAtt"),
    );
    const row = fake.models.attendance.rows[0];
    expect(row.status).toBe("SAKIT");
    expect(row.notes).toBe("catatan awal");
  });

  it("clears notes on an explicit null", async () => {
    await ATTENDANCE(
      jsonRequest("/x", { staffId: "stf1", date: "2026-08-01", status: "HADIR", notes: "catatan awal" }),
      ctx("trAtt"),
    );
    await ATTENDANCE(
      jsonRequest("/x", { staffId: "stf1", date: "2026-08-01", status: "HADIR", notes: null }),
      ctx("trAtt"),
    );
    expect(fake.models.attendance.rows[0].notes).toBeNull();
  });

  it("updates notes normally when a new value is provided", async () => {
    await ATTENDANCE(
      jsonRequest("/x", { staffId: "stf1", date: "2026-08-01", status: "HADIR", notes: "lama" }),
      ctx("trAtt"),
    );
    await ATTENDANCE(
      jsonRequest("/x", { staffId: "stf1", date: "2026-08-01", status: "HADIR", notes: "baru" }),
      ctx("trAtt"),
    );
    expect(fake.models.attendance.rows[0].notes).toBe("baru");
  });

  it("rejects attendance for a non-participant (404)", async () => {
    const res = await ATTENDANCE(
      jsonRequest("/x", { staffId: "intruder", date: "2026-08-01", status: "HADIR" }),
      ctx("trAtt"),
    );
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────── B6 ───────────────────────────────
describe("B6 — assessment `completed` precedence & consistency", () => {
  beforeEach(async () => {
    await fake.models.training.create({ data: { id: "trAsmt", title: "Asmt", status: "COMPLETED" } });
    await fake.models.participants.create({ data: { trainingId: "trAsmt", staffId: "stf1", status: "CONFIRMED" } });
  });

  it("a saved score with NO `completed` field implies completed = true", async () => {
    await ASSESSMENT(jsonRequest("/x", { staffId: "stf1", score: 80 }), ctx("trAsmt"));
    const a = fake.models.assessment.rows[0];
    expect(a.completed).toBe(true);
    expect(a.grade).toBe("B"); // 80 → B (derived consistently)
    expect(a.completedAt).toBeTruthy();
  });

  it("an explicit `completed: true` is honoured even without a score", async () => {
    await ASSESSMENT(jsonRequest("/x", { staffId: "stf1", completed: true }), ctx("trAsmt"));
    expect(fake.models.assessment.rows[0].completed).toBe(true);
  });

  it("an explicit `completed: false` is honoured (no score sent)", async () => {
    await ASSESSMENT(jsonRequest("/x", { staffId: "stf1", completed: false }), ctx("trAsmt"));
    const a = fake.models.assessment.rows[0];
    expect(a.completed).toBe(false);
    expect(a.completedAt).toBeNull();
  });

  it("score-implied completion wins over a PRIOR explicit false (most recent intent)", async () => {
    await ASSESSMENT(jsonRequest("/x", { staffId: "stf1", completed: false }), ctx("trAsmt"));
    await ASSESSMENT(jsonRequest("/x", { staffId: "stf1", score: 90 }), ctx("trAsmt"));
    const a = fake.models.assessment.rows[0];
    expect(a.completed).toBe(true);
    expect(a.score).toBe(90);
    expect(a.grade).toBe("A");
  });

  it("keeps the previous completion when neither score nor completed is sent", async () => {
    await ASSESSMENT(jsonRequest("/x", { staffId: "stf1", score: 70 }), ctx("trAsmt"));
    await ASSESSMENT(jsonRequest("/x", { staffId: "stf1", grade: "C" }), ctx("trAsmt"));
    const a = fake.models.assessment.rows[0];
    expect(a.completed).toBe(true); // retained
    expect(a.grade).toBe("C");
  });
});
