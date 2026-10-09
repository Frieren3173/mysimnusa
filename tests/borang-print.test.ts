import { describe, it, expect } from "vitest";
import { printHrefFor } from "@/lib/borang-print";

/**
 * Regression for the `/borang/print` production "server error" (digest
 * 1781716760).
 *
 * Root cause: the print page (Server Component) passed a FUNCTION prop
 * (`canPrintHref`) to the client `BorangReviewClient`, which is not serializable
 * across the server→client boundary → render-time throw.
 *
 * Fix: derive the link on the client from the entry itself. This test locks the
 * URL builder's contract, including the guards that let callers safely skip the
 * preview action.
 */
describe("printHrefFor", () => {
  it("builds the DOCX export link for a valid entry", () => {
    expect(printHrefFor({ period: "2026-07", staff: { id: "s1" } })).toBe(
      "/api/borang/export?staffId=s1&year=2026",
    );
  });

  it("uses only the 4-digit year from the period", () => {
    expect(printHrefFor({ period: "2024-12", staff: { id: "abc" } })).toBe(
      "/api/borang/export?staffId=abc&year=2024",
    );
  });

  it("url-encodes the staff id", () => {
    expect(printHrefFor({ period: "2026-01", staff: { id: "a/b c" } })).toBe(
      "/api/borang/export?staffId=a%2Fb%20c&year=2026",
    );
  });

  it("returns null for a missing staff id", () => {
    expect(printHrefFor({ period: "2026-01", staff: { id: "" } })).toBeNull();
  });

  it("returns null for a missing/!YYYY period", () => {
    expect(printHrefFor({ period: "", staff: { id: "s1" } })).toBeNull();
    expect(printHrefFor({ period: "July", staff: { id: "s1" } })).toBeNull();
  });

  it("returns null for null/undefined input (safe optional handling)", () => {
    expect(printHrefFor(null)).toBeNull();
    expect(printHrefFor(undefined)).toBeNull();
  });

  it("never throws when staff is absent", () => {
    // Defensive: a malformed entry must not crash the client render.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(printHrefFor({ period: "2026-01" } as any)).toBeNull();
  });
});
