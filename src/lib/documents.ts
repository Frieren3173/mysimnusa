import { daysUntilExpiry } from "@/lib/utils";

/**
 * Document availability vs. validity — the single source of truth for the UI.
 *
 * Two orthogonal concepts were historically conflated, which made real, present
 * files show up as "Belum Tersedia":
 *
 *   1. AVAILABILITY  — is there a file we can open?  → derived from the storage
 *      reference (`storageKey` for R2/local, `legacyDriveUrl` for Drive), NEVER
 *      from the derived status label.
 *
 *   2. VALIDITY — is the document still within its validity window? → derived
 *      from `expiryDate` / `isLifetime` / `hasExpiry` (the document type flag).
 *      Non-expiring types (IJAZAH, FOTO, SURAT_PENGALAMAN, …) have no expiry and
 *      must NOT be reported as expired or missing just because the date is null.
 *
 * `Document.status` in the database is a legacy, migration-derived value and is
 * therefore NOT used to decide availability. It is only a fallback hint.
 */

export type DocumentValidity =
  | "ACTIVE"
  | "EXPIRING"
  | "EXPIRED"
  | "LIFETIME"
  | "NO_EXPIRY";

/** Minimal fields both DB rows and API payloads provide. */
export interface DocumentLike {
  storageKey?: string | null;
  legacyDriveUrl?: string | null;
  filename?: string | null;
  expiryDate?: Date | string | null;
  isLifetime?: boolean;
  /** Document type's `hasExpiry` flag (true for STR/SIP/BTCLS/ACLS). */
  hasExpiry?: boolean;
  /** Optional pre-computed status (legacy). */
  status?: string | null;
}

/** True when a file reference exists (openable), regardless of validity. */
export function isDocumentAvailable(doc: DocumentLike): boolean {
  if (doc.storageKey && doc.storageKey.trim() !== "") return true;
  if (doc.legacyDriveUrl && doc.legacyDriveUrl.trim() !== "") return true;
  return false;
}

/** Where the file lives, for choosing the open mechanism. */
export function documentSource(doc: DocumentLike): "storage" | "drive" | "none" {
  if (doc.storageKey && doc.storageKey.trim() !== "") return "storage";
  if (doc.legacyDriveUrl && doc.legacyDriveUrl.trim() !== "") return "drive";
  return "none";
}

/**
 * Validity of a document.
 *
 * Rules (in order):
 *  • `isLifetime`            → LIFETIME.
 *  • type has no expiry      → NO_EXPIRY (never expired/missing).
 *  • has a date             → EXPIRED / EXPIRING (≤90d) / ACTIVE by days.
 *  • expiring type, no date → EXPIRED? No — unknown, treat as NO_EXPIRY so we
 *    don't fabricate an expired state. (Missing data is flagged elsewhere via
 *    availability, not validity.)
 */
export function deriveValidity(
  doc: DocumentLike,
  expiringWindowDays = 90,
): DocumentValidity {
  if (doc.isLifetime) return "LIFETIME";
  const hasExpiry = doc.hasExpiry ?? true;
  if (!hasExpiry) return "NO_EXPIRY";
  if (!doc.expiryDate) return "NO_EXPIRY";
  const days = daysUntilExpiry(doc.expiryDate);
  if (days === null) return "NO_EXPIRY";
  if (days < 0) return "EXPIRED";
  if (days <= expiringWindowDays) return "EXPIRING";
  return "ACTIVE";
}

/** Indonesian label + Badge variant for a validity value. */
export const VALIDITY_META: Record<
  DocumentValidity,
  { label: string; variant: "active" | "expiring" | "expired" | "lifetime" | "default" }
> = {
  ACTIVE: { label: "Aktif", variant: "active" },
  EXPIRING: { label: "Akan Berakhir", variant: "expiring" },
  EXPIRED: { label: "Expired", variant: "expired" },
  LIFETIME: { label: "Seumur Hidup", variant: "lifetime" },
  NO_EXPIRY: { label: "Tanpa Kedaluwarsa", variant: "default" },
};

/**
 * Human-readable expiry line for a document: the date, "Seumur Hidup", or a
 * clear "Tanpa tanggal berakhir" for non-expiring types.
 */
export function expiryText(doc: DocumentLike): string {
  if (doc.isLifetime) return "Seumur Hidup";
  const hasExpiry = doc.hasExpiry ?? true;
  if (!hasExpiry) return "Tanpa tanggal berakhir";
  if (!doc.expiryDate) return "Tanpa tanggal berakhir";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(doc.expiryDate));
}
