import { describe, it, expect } from "vitest";
import {
  isDocumentAvailable,
  documentSource,
  deriveValidity,
  expiryText,
  expiringWhere,
  expiredWhere,
  VALIDITY_META,
} from "@/lib/documents";

/**
 * Document availability vs validity.
 *
 * These lock the fix for "Belum Tersedia" on documents whose file actually
 * exists, and ensure non-expiring document types are never reported as
 * expired/missing just because they have no expiry date.
 */
describe("isDocumentAvailable (file reference, not status)", () => {
  it("true when a storageKey exists", () => {
    expect(isDocumentAvailable({ storageKey: "staff/x/str/a.pdf" })).toBe(true);
  });
  it("true when a legacy Drive URL exists", () => {
    expect(isDocumentAvailable({ legacyDriveUrl: "https://drive.example/1" })).toBe(true);
  });
  it("false when neither exists", () => {
    expect(isDocumentAvailable({ storageKey: null, legacyDriveUrl: null })).toBe(false);
    expect(isDocumentAvailable({})).toBe(false);
  });
  it("ignores a misleading legacy status of MISSING", () => {
    expect(isDocumentAvailable({ status: "MISSING", storageKey: "k/a.pdf" })).toBe(true);
  });
  it("is unaffected by expiry", () => {
    const past = new Date("2000-01-01");
    expect(isDocumentAvailable({ storageKey: "k", expiryDate: past })).toBe(true);
  });
});

describe("documentSource", () => {
  it("prefers storage over drive", () => {
    expect(documentSource({ storageKey: "k", legacyDriveUrl: "d" })).toBe("storage");
  });
  it("falls back to drive", () => {
    expect(documentSource({ legacyDriveUrl: "d" })).toBe("drive");
  });
  it("none when nothing", () => {
    expect(documentSource({})).toBe("none");
  });
});

describe("deriveValidity", () => {
  const now = Date.now();
  const days = (n: number) => new Date(now + n * 24 * 60 * 60 * 1000);

  it("LIFETIME when isLifetime", () => {
    expect(deriveValidity({ isLifetime: true, hasExpiry: true, expiryDate: days(10) })).toBe("LIFETIME");
  });

  it("NO_EXPIRY for non-expiring types even with a null date", () => {
    // e.g. IJAZAH / FOTO / SURAT_PENGALAMAN
    expect(deriveValidity({ hasExpiry: false, expiryDate: null })).toBe("NO_EXPIRY");
  });

  it("NO_EXPIRY for an expiring type left without a date (never fabricates EXPIRED)", () => {
    expect(deriveValidity({ hasExpiry: true, expiryDate: null })).toBe("NO_EXPIRY");
  });

  it("ACTIVE well beyond the warning window", () => {
    expect(deriveValidity({ hasExpiry: true, expiryDate: days(200) })).toBe("ACTIVE");
  });

  it("EXPIRING within 90 days", () => {
    expect(deriveValidity({ hasExpiry: true, expiryDate: days(30) })).toBe("EXPIRING");
    expect(deriveValidity({ hasExpiry: true, expiryDate: days(90) })).toBe("EXPIRING");
  });

  it("EXPIRED in the past", () => {
    expect(deriveValidity({ hasExpiry: true, expiryDate: days(-1) })).toBe("EXPIRED");
  });

  it("a present, non-expiring document is available AND NO_EXPIRY (not MISSING/EXPIRED)", () => {
    const doc = { hasExpiry: false, expiryDate: null, storageKey: "k/ijazah.pdf" };
    expect(isDocumentAvailable(doc)).toBe(true);
    expect(deriveValidity(doc)).toBe("NO_EXPIRY");
  });
});

describe("expiryText", () => {
  it("Seumur Hidup for lifetime", () => {
    expect(expiryText({ isLifetime: true })).toBe("Seumur Hidup");
  });
  it("no-date wording for non-expiring types", () => {
    expect(expiryText({ hasExpiry: false, expiryDate: null })).toBe("Tanpa tanggal berakhir");
  });
  it("formats a date when present", () => {
    expect(expiryText({ hasExpiry: true, expiryDate: "2026-03-15" })).toMatch(/2026/);
  });
});

describe("VALIDITY_META", () => {
  it("covers every validity value with a label", () => {
    for (const v of ["ACTIVE", "EXPIRING", "EXPIRED", "LIFETIME", "NO_EXPIRY"] as const) {
      expect(VALIDITY_META[v].label).toBeTruthy();
      expect(VALIDITY_META[v].variant).toBeTruthy();
    }
  });
});

describe("dashboard expiry windows (single source of truth)", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");
  const in90 = new Date("2026-08-30T00:00:00.000Z");

  it("expiring window is inclusive on both ends and excludes lifetime", () => {
    const w = expiringWhere({ from: now, to: in90 });
    expect(w.isLifetime).toBe(false);
    expect(w.expiryDate).toEqual({ gte: now, lte: in90 });
  });

  it("expired window is strictly before now and excludes lifetime", () => {
    const w = expiredWhere(now);
    expect(w.isLifetime).toBe(false);
    expect(w.expiryDate).toEqual({ lt: now });
  });

  it("the two windows never overlap at the boundary (now)", () => {
    const exp = expiringWhere({ from: now, to: in90 });
    const expired = expiredWhere(now);
    // A document expiring exactly at `now` is "expiring", never "expired".
    expect(exp.expiryDate.gte.getTime()).toBe(now.getTime());
    expect(expired.expiryDate.lt.getTime()).toBe(now.getTime());
    expect(exp.expiryDate.gte.getTime()).toBeGreaterThanOrEqual(expired.expiryDate.lt.getTime());
  });

  it("a null expiry satisfies neither window (non-expiring types)", () => {
    // Prisma range filters (gte/lte/lt) never match NULL, so a document with no
    // expiry date is excluded from both the expiring and expired lists. The
    // clauses must therefore never target NULL explicitly.
    const exp = expiringWhere({ from: now, to: in90 });
    const expired = expiredWhere(now);
    expect(JSON.stringify(exp)).not.toContain("null");
    expect(JSON.stringify(expired)).not.toContain("null");
  });
});

