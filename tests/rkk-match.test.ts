import { describe, it, expect } from "vitest";
import {
  normalizeName,
  extractNip,
  fileStem,
  matchFile,
  matchFiles,
  type StaffCandidate,
} from "@/lib/komite/rkk-match";

const STAFF: StaffCandidate[] = [
  { id: "s1", name: "A'isyah Nurul Az Zahrah, A.Md.Kep", nip: "200006292025212066" },
  { id: "s2", name: "Budi Santoso", nip: "198765432109876543" },
  { id: "s3", name: "Budiati Rahayu", nip: "111122223333444455" },
];

describe("normalizeName / extractNip / fileStem", () => {
  it("normalises names (case, punctuation, diacritics)", () => {
    expect(normalizeName("  A'isyah  Nurul-Az  ")).toBe("a isyah nurul az");
    expect(normalizeName("BUDI SANTOSO")).toBe("budi santoso");
  });
  it("extracts the longest digit run of length >= 8", () => {
    expect(extractNip("RKK_200006292025212066_Aisyah.pdf")).toBe("200006292025212066");
    expect(extractNip("RKK_2025.pdf")).toBe(null); // too short
  });
  it("strips the extension", () => {
    expect(fileStem("RKK Budi.pdf")).toBe("RKK Budi");
    expect(fileStem("a.b.c.docx")).toBe("a.b.c");
  });
});

describe("matchFile", () => {
  it("matches uniquely by NIP in the filename", () => {
    const r = matchFile("RKK_200006292025212066.pdf", STAFF);
    expect(r.status).toBe("MATCHED");
    expect(r.staffId).toBe("s1");
    expect(r.method).toBe("NIP");
  });

  it("matches a filename that CONTAINS the full staff name", () => {
    const r = matchFile("RKK BUDI SANTOSO.pdf", STAFF);
    expect(r.status).toBe("MATCHED");
    expect(r.staffId).toBe("s2");
    expect(r.method).toBe("NAME");
  });

  it("does NOT match on a partial first name alone (avoids guessing)", () => {
    // "Budi" is a partial of both "Budi Santoso" and "Budiati" → no confident match.
    const r = matchFile("Budi.pdf", STAFF);
    expect(r.status).toBe("UNMATCHED");
  });

  it("prefers an EXACT name over a longer superset (deterministic)", () => {
    const staff: StaffCandidate[] = [
      { id: "a", name: "Siti Aminah", nip: "100000000000000001" },
      { id: "b", name: "Siti Aminah Pertiwi", nip: "100000000000000002" },
    ];
    const exact = matchFile("Siti Aminah.pdf", staff);
    expect(exact.status).toBe("MATCHED");
    expect(exact.staffId).toBe("a");
  });

  it("is AMBIGUOUS when a partial name is contained in two staff and no exact match", () => {
    const staff: StaffCandidate[] = [
      { id: "a", name: "Dewi Lestari Anggraini", nip: "100000000000000001" },
      { id: "b", name: "Dewi Lestari Puspita", nip: "100000000000000002" },
    ];
    // File stem contains "dewi lestari" which is inside BOTH full names.
    const r = matchFile("RKK Dewi Lestari.pdf", staff);
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.candidateCount).toBe(2);
  });

  it("is UNMATCHED when nothing matches", () => {
    const r = matchFile("dokumen_lain.pdf", STAFF);
    expect(r.status).toBe("UNMATCHED");
  });
});

describe("matchFiles report", () => {
  it("groups matched/unmatched/ambiguous and totals", () => {
    const report = matchFiles(
      ["RKK_200006292025212066.pdf", "BUDI SANTOSO.pdf", "unknown-file.pdf"],
      STAFF,
    );
    expect(report.total).toBe(3);
    expect(report.matched.length).toBe(2);
    expect(report.unmatched.length).toBe(1);
    expect(report.ambiguous.length).toBe(0);
  });
});
