import { describe, it, expect } from "vitest";
import {
  neutralizeSpreadsheetCell,
  neutralizeSpreadsheetRow,
  isNumericLiteral,
  isDateLiteral,
} from "@/lib/spreadsheet";

describe("neutralizeSpreadsheetCell", () => {
  it("prefixes formula-trigger values with a single quote", () => {
    expect(neutralizeSpreadsheetCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(neutralizeSpreadsheetCell("+1+1")).toBe("'+1+1");
    expect(neutralizeSpreadsheetCell("-2+3")).toBe("'-2+3");
    expect(neutralizeSpreadsheetCell("@cmd")).toBe("'@cmd");
    expect(neutralizeSpreadsheetCell("\t=1+1")).toBe("'\t=1+1");
    expect(neutralizeSpreadsheetCell("\r=1+1")).toBe("'\r=1+1");
  });

  it("leaves plain text untouched", () => {
    expect(neutralizeSpreadsheetCell("Infus")).toBe("Infus");
    expect(neutralizeSpreadsheetCell("Tn.A")).toBe("Tn.A");
  });

  it("keeps pure numbers as numbers", () => {
    expect(neutralizeSpreadsheetCell(12)).toBe(12);
    expect(neutralizeSpreadsheetCell("12")).toBe("12");
    expect(neutralizeSpreadsheetCell("3.14")).toBe("3.14");
    expect(neutralizeSpreadsheetCell("-42")).toBe("-42");
  });

  it("keeps ISO dates untouched", () => {
    expect(neutralizeSpreadsheetCell("2024-01-31")).toBe("2024-01-31");
    expect(neutralizeSpreadsheetCell("2024-01-31T08:00:00")).toBe("2024-01-31T08:00:00");
  });

  it("handles null/undefined as empty string", () => {
    expect(neutralizeSpreadsheetCell(null)).toBe("");
    expect(neutralizeSpreadsheetCell(undefined)).toBe("");
  });
});

describe("neutralizeSpreadsheetRow", () => {
  it("neutralizes every string field but preserves numerics", () => {
    const out = neutralizeSpreadsheetRow({
      name: "=cmd",
      qty: 3,
      date: "2024-05-01",
      note: "@evil",
    });
    expect(out.name).toBe("'=cmd");
    expect(out.qty).toBe(3);
    expect(out.date).toBe("2024-05-01");
    expect(out.note).toBe("'@evil");
  });
});

describe("literal detectors", () => {
  it("detects numeric literals", () => {
    expect(isNumericLiteral("123")).toBe(true);
    expect(isNumericLiteral("-1.5e3")).toBe(true);
    expect(isNumericLiteral("12abc")).toBe(false);
  });
  it("detects date literals", () => {
    expect(isDateLiteral("2024-12-31")).toBe(true);
    expect(isDateLiteral("31/12/2024")).toBe(false);
  });
});
