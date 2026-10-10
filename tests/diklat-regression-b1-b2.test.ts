import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFakePrisma } from "./helpers/fake-db";
import {
  authState,
  setCurrentUser,
  SUPERADMIN,
  userWith,
  jsonRequest,
  ctx,
  readResponse,
} from "./helpers/route-harness";

/**
 * B1 — Manual certificate issuance must enforce the activity's certificate
 * policy (attendance + optional test/min-score), never issue for an ineligible
 * participant, and be idempotent. Verified against the REAL route handler +
 * REAL shared issuance service, with an in-memory Prisma double that enforces
 * unique constraints.
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

import { POST } from "@/server/api/diklat-trainings-$id$-certificates";
import { POST as PROCESS } from "@/server/api/diklat-trainings-$id$-certificates-process";

const fake = getFakePrisma();

const TRAINING = "trn_b1";

async function seedTraining(overrides: Record<string, unknown> = {}) {
  fake.models.training.rows = [];
  fake.models.participants.rows = [];
  fake.models.attendance.rows = [];
  fake.models.assessment.rows = [];
  fake.models.certificate.rows = [];
  await fake.models.training.create({
    data: {
      id: TRAINING,
      title: "IHT B1",
      status: "COMPLETED",
      certificateMode: "TEST_SCORED",
      requireTest: false,
      requireMinScore: true,
      minScore: 80,
      showScore: true,
      minAttendanceRate: null,
      ...overrides,
    },
  });
}

async function addParticipant(staffId = "stf1", status = "CONFIRMED") {
  await fake.models.participants.create({ data: { trainingId: TRAINING, staffId, status } });
}

async function addHadir(staffId = "stf1") {
  await fake.models.attendance.create({
    data: { trainingId: TRAINING, staffId, date: new Date("2026-08-01T00:00:00.000Z"), status: "HADIR" },
  });
}

async function addAssessment(staffId = "stf1", score: number | null, completed = true) {
  await fake.models.assessment.create({ data: { trainingId: TRAINING, staffId, score, completed } });
}

describe("B1 — manual certificate issuance eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCurrentUser(SUPERADMIN());
  });

  it("rejects issuance for a participant with NO attendance (422) and stores nothing", async () => {
    await seedTraining();
    await addParticipant();
    const res = await POST(jsonRequest(`/x`, { staffId: "stf1" }), ctx(TRAINING));
    const body = await readResponse(res);
    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(fake.models.certificate.rows.length).toBe(0);
  });

  it("rejects issuance when the score is below the required minimum (422)", async () => {
    await seedTraining();
    await addParticipant();
    await addHadir();
    await addAssessment("stf1", 50, true);
    const res = await POST(jsonRequest("/x", { staffId: "stf1" }), ctx(TRAINING));
    expect(res.status).toBe(422);
    expect(fake.models.certificate.rows.length).toBe(0);
  });

  it("issues a certificate for a participant meeting the policy (200) with trigger MANUAL", async () => {
    await seedTraining();
    await addParticipant();
    await addHadir();
    await addAssessment("stf1", 90, true);
    const res = await POST(jsonRequest("/x", { staffId: "stf1" }), ctx(TRAINING));
    const body = await readResponse(res);
    expect(res.status).toBe(200);
    expect(body.data?.certificate).toBeTruthy();
    const certs = fake.models.certificate.rows;
    expect(certs.length).toBe(1);
    expect(certs[0].trigger).toBe("MANUAL");
    expect(certs[0].staffId).toBe("stf1");
  });

  it("is idempotent: a second call does not create a duplicate", async () => {
    await seedTraining();
    await addParticipant();
    await addHadir();
    await addAssessment("stf1", 90, true);
    await POST(jsonRequest("/x", { staffId: "stf1" }), ctx(TRAINING));
    const res2 = await POST(jsonRequest("/x", { staffId: "stf1" }), ctx(TRAINING));
    const body2 = await readResponse(res2);
    expect(res2.status).toBe(200);
    expect(body2.data?.certificate).toBeTruthy();
    expect(fake.models.certificate.rows.length).toBe(1);
  });

  it("rejects a non-participant (404) — cross-activity issue is impossible", async () => {
    await seedTraining();
    await addParticipant("stf_other");
    const res = await POST(jsonRequest("/x", { staffId: "stf_intruder" }), ctx(TRAINING));
    expect(res.status).toBe(404);
  });

  it("denies an authenticated user WITHOUT the issue permission (403)", async () => {
    await seedTraining();
    await addParticipant();
    await addHadir();
    await addAssessment("stf1", 90, true);
    setCurrentUser(userWith(["some.other.perm"]));
    const res = await POST(jsonRequest("/x", { staffId: "stf1" }), ctx(TRAINING));
    expect(res.status).toBe(403);
    expect(fake.models.certificate.rows.length).toBe(0);
  });

  it("denies an unauthenticated caller (401)", async () => {
    await seedTraining();
    await addParticipant();
    setCurrentUser(null);
    const res = await POST(jsonRequest("/x", { staffId: "stf1" }), ctx(TRAINING));
    expect(res.status).toBe(401);
  });
});

describe("B2 — a CANCELLED activity issues nothing on every path", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setCurrentUser(SUPERADMIN());
    await seedTraining({ status: "CANCELLED" });
    await addParticipant();
    await addHadir();
    await addAssessment("stf1", 95, true); // otherwise fully eligible
  });

  it("manual issue endpoint → 409 and no certificate row", async () => {
    const res = await POST(jsonRequest("/x", { staffId: "stf1" }), ctx(TRAINING));
    expect(res.status).toBe(409);
    expect(fake.models.certificate.rows.length).toBe(0);
  });

  it("batch process endpoint → 200 with issued:0 and cancelled:true", async () => {
    const res = await PROCESS(jsonRequest("/x", {}, "POST"), ctx(TRAINING));
    const body = await readResponse(res);
    expect(res.status).toBe(200);
    expect(body.data?.issued).toBe(0);
    expect(body.data?.cancelled).toBe(true);
    expect(fake.models.certificate.rows.length).toBe(0);
  });
});

describe("B1 — ≥1 HADIR is required in EVERY certificate mode (binary)", () => {
  const MODES = ["ATTENDANCE_ONLY", "TEST_SCORED", "TEST_COMPLETION"] as const;

  for (const mode of MODES) {
    const needsTest = mode !== "ATTENDANCE_ONLY";
    it(`mode ${mode}: no HADIR → rejected (422), with HADIR${needsTest ? " + completed test" : ""} → issued (200)`, async () => {
      vi.clearAllMocks();
      setCurrentUser(SUPERADMIN());
      // Policy without min-score so the ONLY gates under test are (binary)
      // attendance, plus the pre-existing test requirement for modes B/C.
      await seedTraining({ certificateMode: mode, requireTest: false, requireMinScore: false, minScore: null });
      await addParticipant();

      const denied = await POST(jsonRequest("/x", { staffId: "stf1" }), ctx(TRAINING));
      expect(denied.status).toBe(422);
      expect(fake.models.certificate.rows.length).toBe(0);

      await addHadir();
      if (needsTest) await addAssessment("stf1", 70, true);
      const ok = await POST(jsonRequest("/x", { staffId: "stf1" }), ctx(TRAINING));
      expect(ok.status).toBe(200);
      expect(fake.models.certificate.rows.length).toBe(1);
    });
  }

  it("mode B/C still require a COMPLETED test (attendance alone is not enough)", async () => {
    vi.clearAllMocks();
    setCurrentUser(SUPERADMIN());
    await seedTraining({ certificateMode: "TEST_SCORED", requireTest: false, requireMinScore: false, minScore: null });
    await addParticipant();
    await addHadir(); // present, but test not completed
    const res = await POST(jsonRequest("/x", { staffId: "stf1" }), ctx(TRAINING));
    expect(res.status).toBe(422);
    expect(fake.models.certificate.rows.length).toBe(0);
  });

  it("SAKIT/IZIN only (no HADIR) is rejected even if the legacy rate is satisfied", async () => {
    vi.clearAllMocks();
    setCurrentUser(SUPERADMIN());
    await seedTraining({ certificateMode: "ATTENDANCE_ONLY", requireTest: false, requireMinScore: false, minScore: null, minAttendanceRate: 10 });
    await addParticipant();
    await fake.models.attendance.create({
      data: { trainingId: TRAINING, staffId: "stf1", date: new Date("2026-08-01T00:00:00.000Z"), status: "SAKIT" },
    });
    const res = await POST(jsonRequest("/x", { staffId: "stf1" }), ctx(TRAINING));
    expect(res.status).toBe(422);
    expect(fake.models.certificate.rows.length).toBe(0);
  });

  it("a legacy minAttendanceRate (e.g. 100) does NOT block a single-HADIR participant", async () => {
    vi.clearAllMocks();
    setCurrentUser(SUPERADMIN());
    await seedTraining({ certificateMode: "ATTENDANCE_ONLY", requireTest: false, requireMinScore: false, minScore: null, minAttendanceRate: 100 });
    await addParticipant();
    await addHadir();
    const res = await POST(jsonRequest("/x", { staffId: "stf1" }), ctx(TRAINING));
    expect(res.status).toBe(200);
    expect(fake.models.certificate.rows.length).toBe(1);
  });
});
