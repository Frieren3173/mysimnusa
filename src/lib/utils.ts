import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format date to Indonesian locale */
export function formatDate(date: Date | string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...opts,
  }).format(new Date(date));
}

/** Format date short: 03 Jan 2024 */
export function formatDateShort(date: Date | string | null): string {
  return formatDate(date, { day: "2-digit", month: "short", year: "numeric" });
}

/** Days until expiry. Negative = already expired. */
export function daysUntilExpiry(expiryDate: Date | string | null): number | null {
  if (!expiryDate) return null;
  const now = new Date();
  const exp = new Date(expiryDate);
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Derive document status from dates */
export function deriveDocumentStatus(
  expiryDate: Date | string | null,
  isLifetime: boolean
): "ACTIVE" | "EXPIRING" | "EXPIRED" | "LIFETIME" | "MISSING" {
  if (isLifetime) return "LIFETIME";
  if (!expiryDate) return "MISSING";
  const days = daysUntilExpiry(expiryDate);
  if (days === null) return "MISSING";
  if (days < 0) return "EXPIRED";
  if (days <= 90) return "EXPIRING";
  return "ACTIVE";
}

/** Format file size to human readable */
export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
}

/** Generate anonymous patient identifier */
export function generatePatientIdentifier(gender: "M" | "F"): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const letter = letters[Math.floor(Math.random() * letters.length)];
  return gender === "M" ? `TN.${letter}` : `NY.${letter}`;
}

/** Truncate text */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}
