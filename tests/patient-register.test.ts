import { describe, it, expect } from "vitest";
import {
  mapRegisterHeaders,
  validateRegisterRows,
  MAX_REGISTER_ROWS,
} from "@/lib/komite/patient-register";

/** Synthetic fixture (NO real patient data). */
const HEADER = ["No.", "Nama Pasien", "Nomor RM", "Diagnosis"];

describe("patient-register — header mapping", () => {
  it("maps the required headers (case/space tolerant)", () => {
    const idx = mapRegisterHeaders(["no", "nama pasien", "nomor rm", "diagnosis"]);
    expect(idx.patientName).toBe(1);
    expect(idx.rmNumber).toBe(2);
    expect(idx.diagnosis).toBe(3);
  });

  it("throws a descriptive error when mandatory columns are missing", () => {
    expect(() => mapRegisterHeaders(["No.", "Keterangan"])).toThrow(/tidak ditemukan/i);
  });
});

describe("patient-register — row validation", () => {
  it("accepts a valid synthetic row", () => {
    const r = validateRegisterRows([{ no: 1, patientName: "Pasien A", rmNumber: "RM-001", diagnosis: "Dx A" }], HEADER);
    expect(r.valid).toHaveLength(1);
    expect(r.errors).toHaveLength(0);
    expect(r.valid[0]).toMatchObject({ no: 1, patientName: "Pasien A", rmNumber: "RM-001", diagnosis: "Dx A" });
  });

  it("skips fully-empty rows silently", () => {
    const r = validateRegisterRows([{ no: "", patientName: "", rmNumber: "", diagnosis: "" }], HEADER);
    expect(r.valid).toHaveLength(0);
    expect(r.errors).toHaveLength(0);
  });

  it("reports missing name / RM per row (no partial import)", () => {
    const r = validateRegisterRows(
      [
        { no: 1, patientName: "", rmNumber: "RM-002", diagnosis: "" },
        { no: 2, patientName: "Pasien B", rmNumber: "", diagnosis: "" },
      ],
      HEADER,
    );
    expect(r.valid).toHaveLength(0);
    expect(r.errors.map((e) => e.row)).toEqual([1, 2]);
  });

  it("flags duplicate RM numbers within the upload", () => {
    const r = validateRegisterRows(
      [
        { no: 1, patientName: "Pasien A", rmNumber: "RM-9", diagnosis: "" },
        { no: 2, patientName: "Pasien A2", rmNumber: "RM-9", diagnosis: "" },
      ],
      HEADER,
    );
    expect(r.valid).toHaveLength(1);
    expect(r.duplicateRm).toEqual(["RM-9"]);
    expect(r.errors[0].message).toMatch(/duplikat/i);
  });

  it("MAX_REGISTER_ROWS is a sane positive bound", () => {
    expect(MAX_REGISTER_ROWS).toBeGreaterThan(0);
  });
});
