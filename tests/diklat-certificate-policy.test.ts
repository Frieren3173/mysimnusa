import { describe, it, expect } from "vitest";
import {
  evaluateEligibility,
  normalizePolicy,
  isCertificateMode,
  CERTIFICATE_MODES,
  type CertificatePolicy,
  type ParticipantProgress,
} from "@/lib/diklat/certificate-policy";

/**
 * Certificate eligibility across the three issuance modes.
 *
 * These lock the business rules: attendance-only, test-scored (min score on/off),
 * test-completion, plus the safety rules (sakit/izin ≠ hadir, incomplete
 * attendance, missing score never passes, cancelled participants).
 */

function policy(over: Partial<CertificatePolicy> = {}): CertificatePolicy {
  return {
    mode: "ATTENDANCE_ONLY",
    requireTest: false,
    requireMinScore: false,
    minScore: null,
    showScore: false,
    minAttendanceRate: null,
    ...over,
  };
}

function progress(over: Partial<ParticipantProgress> = {}): ParticipantProgress {
  return {
    participantCount: 10,
    attendanceRecorded: 2,
    attendancePresent: 2,
    testCompleted: false,
    score: null,
    cancelled: false,
    ...over,
  };
}

describe("normalizePolicy / isCertificateMode", () => {
  it("defaults to ATTENDANCE_ONLY with flags off", () => {
    const p = normalizePolicy({});
    expect(p.mode).toBe("ATTENDANCE_ONLY");
    expect(p.requireTest).toBe(false);
    expect(p.requireMinScore).toBe(false);
    expect(p.showScore).toBe(false);
    expect(p.minScore).toBeNull();
  });
  it("keeps a valid mode and drops an invalid one", () => {
    expect(normalizePolicy({ certificateMode: "TEST_SCORED" }).mode).toBe("TEST_SCORED");
    expect(normalizePolicy({ certificateMode: "NONSENSE" }).mode).toBe("ATTENDANCE_ONLY");
  });
  it("recognises only the three canonical modes", () => {
    expect(CERTIFICATE_MODES).toEqual(["ATTENDANCE_ONLY", "TEST_SCORED", "TEST_COMPLETION"]);
    expect(isCertificateMode("TEST_COMPLETION")).toBe(true);
    expect(isCertificateMode("X")).toBe(false);
  });
});

describe("Mode A — ATTENDANCE_ONLY", () => {
  it("qualifies with attendance and no test", () => {
    expect(evaluateEligibility(policy(), progress()).eligible).toBe(true);
  });
  it("does not require a completed test", () => {
    expect(evaluateEligibility(policy(), progress({ testCompleted: false })).eligible).toBe(true);
  });
  it("qualifies with zero attendance when no min rate is set", () => {
    expect(
      evaluateEligibility(policy(), progress({ attendanceRecorded: 0, attendancePresent: 0 })).eligible,
    ).toBe(true);
  });
});

describe("Mode B — TEST_SCORED", () => {
  const base = policy({ mode: "TEST_SCORED" });

  it("is NOT eligible when the test is not completed", () => {
    const r = evaluateEligibility(base, progress({ testCompleted: false, score: 100 }));
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/Tes belum/);
  });

  it("is eligible when the test is completed and no min score required", () => {
    expect(evaluateEligibility(base, progress({ testCompleted: true, score: 40 })).eligible).toBe(true);
  });

  it("requires the minimum score when enabled", () => {
    const p = policy({ mode: "TEST_SCORED", requireMinScore: true, minScore: 70 });
    expect(evaluateEligibility(p, progress({ testCompleted: true, score: 60 })).eligible).toBe(false);
    expect(evaluateEligibility(p, progress({ testCompleted: true, score: 70 })).eligible).toBe(true);
    expect(evaluateEligibility(p, progress({ testCompleted: true, score: 95 })).eligible).toBe(true);
  });

  it("never passes a missing score when the minimum is required", () => {
    const p = policy({ mode: "TEST_SCORED", requireMinScore: true, minScore: 60 });
    const r = evaluateEligibility(p, progress({ testCompleted: true, score: null }));
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/Nilai belum/);
  });

  it("ignores the minimum score when the requirement is OFF (any score passes)", () => {
    const p = policy({ mode: "TEST_SCORED", requireMinScore: false, minScore: 90 });
    expect(evaluateEligibility(p, progress({ testCompleted: true, score: 10 })).eligible).toBe(true);
  });
});

describe("Mode C — TEST_COMPLETION", () => {
  const base = policy({ mode: "TEST_COMPLETION" });

  it("completion alone qualifies (no value requirement)", () => {
    expect(evaluateEligibility(base, progress({ testCompleted: true, score: 0 })).eligible).toBe(true);
    expect(evaluateEligibility(base, progress({ testCompleted: true, score: null })).eligible).toBe(true);
  });
  it("is NOT eligible until the test is submitted", () => {
    expect(evaluateEligibility(base, progress({ testCompleted: false })).eligible).toBe(false);
  });
  it("honours the minimum when enabled", () => {
    const p = policy({ mode: "TEST_COMPLETION", requireMinScore: true, minScore: 75 });
    expect(evaluateEligibility(p, progress({ testCompleted: true, score: 75 })).eligible).toBe(true);
    expect(evaluateEligibility(p, progress({ testCompleted: true, score: 74 })).eligible).toBe(false);
  });
});

describe("attendance integrity", () => {
  it("SAKIT/IZIN do not count as present (rate from recorded rows)", () => {
    // 1 present of 3 recorded = 33% → below a 50% requirement.
    const p = policy({ minAttendanceRate: 50 });
    const r = evaluateEligibility(p, progress({ attendanceRecorded: 3, attendancePresent: 1 }));
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/Kehadiran 33%/);
  });

  it("incomplete attendance (no records) fails a min-rate requirement", () => {
    const p = policy({ minAttendanceRate: 50 });
    const r = evaluateEligibility(p, progress({ attendanceRecorded: 0, attendancePresent: 0 }));
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/belum dicatat/);
  });

  it("meets the rate exactly at the threshold", () => {
    const p = policy({ minAttendanceRate: 50 });
    expect(evaluateEligibility(p, progress({ attendanceRecorded: 2, attendancePresent: 1 })).eligible).toBe(true);
  });
});

describe("safety: cancelled participants", () => {
  it("are never eligible regardless of everything else", () => {
    const r = evaluateEligibility(
      policy({ mode: "TEST_SCORED" }),
      progress({ cancelled: true, testCompleted: true, score: 100, attendancePresent: 5, attendanceRecorded: 5 }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/dibatalkan/);
  });
});

describe("showScore is a display flag only (never changes eligibility)", () => {
  it("does not affect the decision", () => {
    const withScore = evaluateEligibility(
      policy({ mode: "TEST_SCORED", showScore: true }),
      progress({ testCompleted: true, score: 50 }),
    );
    const without = evaluateEligibility(
      policy({ mode: "TEST_SCORED", showScore: false }),
      progress({ testCompleted: true, score: 50 }),
    );
    expect(withScore.eligible).toBe(without.eligible);
  });
});
