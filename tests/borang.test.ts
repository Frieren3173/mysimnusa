import { describe, it, expect } from "vitest";
import {
  generateRmNumber,
  generatePatientCode,
  expandPatientRows,
  PATIENT_CODE_RE,
} from "@/lib/borang";

describe("generateRmNumber()", () => {
  it("produces exactly 6 digits, zero-padded", () => {
    for (let i = 0; i < 200; i++) {
      const rm = generateRmNumber([]);
      expect(rm).toMatch(/^\d{6}$/);
    }
  });

  it("never returns 000000", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateRmNumber([])).not.toBe("000000");
    }
  });

  it("avoids values already taken", () => {
    const taken = new Set<string>();
    // Reserve the first 900 possible numbers, leaving a small free set.
    for (let n = 1; n <= 900; n++) taken.add(String(n).padStart(6, "0"));
    for (let i = 0; i < 50; i++) {
      const rm = generateRmNumber(taken);
      expect(taken.has(rm)).toBe(false);
    }
  });
});

describe("generatePatientCode()", () => {
  it("uses TN/NY for a general room", () => {
    const code = generatePatientCode("Rawat Inap", []);
    expect(code).toMatch(/^(TN|NY)\.[A-Z]{1,2}$/);
    expect(PATIENT_CODE_RE.test(code)).toBe(true);
  });

  it("uses BY.* for perinatology / NICU", () => {
    const code = generatePatientCode("Perinatologi", []);
    expect(code).toMatch(/^BY\.(TN|NY)\.[A-Z]{1,2}$/);
  });

  it("uses NY.* for PONEK", () => {
    const code = generatePatientCode("PONEK", []);
    expect(code).toMatch(/^NY\.[A-Z]{1,2}$/);
  });

  it("avoids codes already taken", () => {
    const taken: string[] = [];
    for (const l of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      taken.push(`TN.${l}`);
      taken.push(`NY.${l}`);
    }
    const code = generatePatientCode(null, taken);
    // Only two-letter codes remain for TN/NY.
    expect(taken).not.toContain(code);
    expect(code).toMatch(/^(TN|NY)\.[A-Z]{2}$/);
  });
});

describe("expandPatientRows()", () => {
  it("keeps a stable, unique 6-digit RM per expanded row", () => {
    const rows = expandPatientRows([
      { period: "2024-01", patientIdentifier: "TN.A", rmNumber: null, actionType: "Infus", quantity: 3 },
      { period: "2024-01", patientIdentifier: "NY.B", rmNumber: null, actionType: "Observasi", quantity: 2 },
    ]);
    expect(rows).toHaveLength(5);
    const rms = rows.map((r) => r.rmNumber);
    expect(new Set(rms).size).toBe(5);
    for (const rm of rms) expect(rm).toMatch(/^\d{6}$/);
    for (const row of rows) expect(row.quantity).toBe(1);
  });

  it("is deterministic across calls (stable RM)", () => {
    const input = [
      { period: "2024-02", patientIdentifier: "TN.C", rmNumber: null, actionType: "EKG", quantity: 2 },
    ];
    const a = expandPatientRows(input).map((r) => r.rmNumber);
    const b = expandPatientRows(input).map((r) => r.rmNumber);
    expect(a).toEqual(b);
  });
});
