import { describe, it, expect } from "vitest";
import {
  actionCodePrefix,
  buildActionCode,
  parseActionSeq,
  maxActionSeq,
} from "@/lib/borang-action-code";

/**
 * D4 — system-generated master tindakan codes. The code is owned by the system:
 * deterministic prefix from the category + a zero-padded sequence, so the API can
 * retry safely on a unique collision.
 */

describe("actionCodePrefix", () => {
  it("uses word initials for multi-word categories", () => {
    expect(actionCodePrefix("Pemberian Obat")).toBe("PO");
    expect(actionCodePrefix("Pencegahan Infeksi")).toBe("PI");
    expect(actionCodePrefix("Tindakan Invasif")).toBe("TI");
  });
  it("uses a short form for single-word categories", () => {
    expect(actionCodePrefix("Assessment")).toBe("ASSESS");
    expect(actionCodePrefix("Monitoring")).toBe("MONITO");
  });
  it("is stable for empty/garbage input", () => {
    expect(actionCodePrefix("!!!")).toBe("TIND");
    expect(actionCodePrefix("")).toBe("TIND");
  });
});

describe("buildActionCode", () => {
  it("pads the sequence to 3 digits", () => {
    expect(buildActionCode("Pemberian Obat", 1)).toBe("PO-001");
    expect(buildActionCode("Pemberian Obat", 42)).toBe("PO-042");
  });
  it("falls back to 1 for invalid sequences", () => {
    expect(buildActionCode("Assessment", 0)).toBe("ASSESS-001");
    expect(buildActionCode("Assessment", -5)).toBe("ASSESS-001");
    expect(buildActionCode("Assessment", NaN)).toBe("ASSESS-001");
  });
});

describe("parseActionSeq", () => {
  it("parses the trailing number for the matching prefix", () => {
    expect(parseActionSeq("PO-007", "Pemberian Obat")).toBe(7);
  });
  it("returns 0 for a different prefix or format", () => {
    expect(parseActionSeq("ASSESS-001", "Pemberian Obat")).toBe(0);
    expect(parseActionSeq("garbage", "Pemberian Obat")).toBe(0);
  });
});

describe("maxActionSeq", () => {
  it("returns the highest sequence sharing the category prefix (ignoring others)", () => {
    const codes = ["PO-001", "PO-005", "ASSESS-009", "PO-003", "other"];
    expect(maxActionSeq(codes, "Pemberian Obat")).toBe(5);
  });
  it("returns 0 when none match", () => {
    expect(maxActionSeq(["ASSESS-001"], "Pemberian Obat")).toBe(0);
  });
});
