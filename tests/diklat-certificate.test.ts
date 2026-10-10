import { describe, it, expect } from "vitest";
import {
  buildPlaceholderMap,
  buildCertificateNumber,
  DEFAULT_NUMBER_PATTERN,
  DEFAULT_NUMBER_PREFIX,
  formatIndoDate,
  romanMonth,
  safeFileName,
  type CertificateData,
} from "@/lib/diklat/certificate";

/**
 * Certificate template data mapping — including the `showScore` behaviour: the
 * score is embedded only when the activity policy includes it, and the number
 * helper stays deterministic/unique.
 */

function baseData(over: Partial<CertificateData> = {}): CertificateData {
  return {
    nama: "Ns. Test",
    tema: "IHT Test",
    tanggal: "2026-08-10",
    tempat: "Aula",
    jpl: 4,
    noSertifikat: "RSAJT/IHT/IBS/001/VIII/2026",
    kepalaSeksiNama: "Kepsek",
    kepalaSeksiNip: "123",
    ...over,
  };
}

describe("buildPlaceholderMap", () => {
  it("maps the core fields", () => {
    const map = buildPlaceholderMap(baseData());
    expect(map["{{NAMA}}"]).toBe("Ns. Test");
    expect(map["{{TEMA}}"]).toBe("IHT Test");
    expect(map["{{NO_SERTIFIKAT}}"]).toBe("RSAJT/IHT/IBS/001/VIII/2026");
    expect(map["{{JPL}}"]).toBe("4");
  });

  it("embeds the score only when provided (showScore on)", () => {
    expect(buildPlaceholderMap(baseData({ nilai: "85" }))["{{NILAI}}"]).toBe("85");
  });

  it("leaves the score empty when the policy hides it", () => {
    expect(buildPlaceholderMap(baseData({ nilai: undefined }))["{{NILAI}}"]).toBe("");
    expect(buildPlaceholderMap(baseData({ nilai: "" }))["{{NILAI}}"]).toBe("");
  });
});

describe("buildCertificateNumber", () => {
  it("fills the default pattern with the roman month and year", () => {
    const n = buildCertificateNumber(DEFAULT_NUMBER_PATTERN, {
      prefix: DEFAULT_NUMBER_PREFIX,
      seq: 5,
      date: "2026-08-10",
    });
    expect(n).toBe("RSAJT/IHT/IBS/005/VIII/2026");
  });

  it("zero-pads the sequence per the {SEQ:n} token", () => {
    expect(buildCertificateNumber("{PREFIX}{SEQ:5}", { prefix: "X/", seq: 7, date: "2026-01-01" })).toBe("X/00007");
  });

  it("is unique for different sequences", () => {
    const a = buildCertificateNumber(DEFAULT_NUMBER_PATTERN, { prefix: "P/", seq: 1, date: "2026-01-01" });
    const b = buildCertificateNumber(DEFAULT_NUMBER_PATTERN, { prefix: "P/", seq: 2, date: "2026-01-01" });
    expect(a).not.toBe(b);
  });
});

describe("formatting helpers", () => {
  it("formats Indonesian long dates", () => {
    expect(formatIndoDate("2026-08-10")).toBe("10 Agustus 2026");
  });
  it("maps months to roman numerals", () => {
    expect(romanMonth("2026-01-01")).toBe("I");
    expect(romanMonth("2026-12-01")).toBe("XII");
  });
  it("sanitises filenames", () => {
    expect(safeFileName("Ns. Test / A")).toBe("Ns._Test_A");
  });
});
