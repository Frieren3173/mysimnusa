import { describe, it, expect } from "vitest";
import {
  evaluateEligibility,
  type CertificatePolicy,
  type ParticipantProgress,
} from "@/lib/diklat/certificate-policy";

/**
 * Mode A (ATTENDANCE_ONLY) eligibility — the core rule:
 *   "Peserta yang tidak hadir tidak memperoleh sertifikat."
 *
 * A certificate requires the participant to have ATTENDED. Merely being a
 * registered participant is not enough:
 *   • HADIR             → present.
 *   • TIDAK_HADIR/SAKIT/IZIN (no HADIR) → NOT present → not eligible.
 *   • no attendance recorded (incomplete) → NOT eligible.
 *   • minAttendanceRate, when set, raises the bar further.
 */

function policyA(over: Partial<CertificatePolicy> = {}): CertificatePolicy {
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

function prog(over: Partial<ParticipantProgress> = {}): ParticipantProgress {
  return {
    participantCount: 5,
    attendanceRecorded: 0,
    attendancePresent: 0,
    testCompleted: false,
    score: null,
    cancelled: false,
    ...over,
  };
}

describe("Mode A attendance requirement (default policy, no min rate)", () => {
  it("HADIR is eligible", () => {
    expect(evaluateEligibility(policyA(), prog({ attendanceRecorded: 1, attendancePresent: 1 })).eligible).toBe(true);
  });

  it("TIDAK_HADIR (no HADIR) is NOT eligible", () => {
    const r = evaluateEligibility(policyA(), prog({ attendanceRecorded: 1, attendancePresent: 0 }));
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/[Hh]adir/);
  });

  it("SAKIT only (no HADIR) is NOT eligible", () => {
    expect(evaluateEligibility(policyA(), prog({ attendanceRecorded: 1, attendancePresent: 0 })).eligible).toBe(false);
  });

  it("IZIN only (no HADIR) is NOT eligible", () => {
    expect(evaluateEligibility(policyA(), prog({ attendanceRecorded: 2, attendancePresent: 0 })).eligible).toBe(false);
  });

  it("no attendance recorded (incomplete) is NOT eligible", () => {
    const r = evaluateEligibility(policyA(), prog({ attendanceRecorded: 0, attendancePresent: 0 }));
    expect(r.eligible).toBe(false);
  });

  it("one HADIR among TIDAK_HADIR/SAKIT is eligible", () => {
    expect(evaluateEligibility(policyA(), prog({ attendanceRecorded: 3, attendancePresent: 1 })).eligible).toBe(true);
  });
});

describe("Mode A — minAttendanceRate on top of presence", () => {
  it("requires both presence and the rate", () => {
    const p = policyA({ minAttendanceRate: 60 });
    expect(evaluateEligibility(p, prog({ attendanceRecorded: 5, attendancePresent: 3 })).eligible).toBe(true); // 60%
    expect(evaluateEligibility(p, prog({ attendanceRecorded: 5, attendancePresent: 2 })).eligible).toBe(false); // 40%
  });
  it("incomplete attendance fails a rate rule", () => {
    expect(evaluateEligibility(policyA({ minAttendanceRate: 50 }), prog({ attendanceRecorded: 0 })).eligible).toBe(false);
  });
});

describe("Mode A never requires a test", () => {
  it("a missing test does not block attendance-based eligibility", () => {
    expect(
      evaluateEligibility(policyA(), prog({ attendanceRecorded: 1, attendancePresent: 1, testCompleted: false, score: null }))
        .eligible,
    ).toBe(true);
  });
});

describe("CANCELLED is never eligible in any mode", () => {
  for (const mode of ["ATTENDANCE_ONLY", "TEST_SCORED", "TEST_COMPLETION"] as const) {
    it(`mode ${mode}`, () => {
      const r = evaluateEligibility(
        policyA({ mode }),
        prog({ cancelled: true, attendanceRecorded: 5, attendancePresent: 5, testCompleted: true, score: 100 }),
      );
      expect(r.eligible).toBe(false);
    });
  }
});
