/**
 * Pure helpers for the Borang print/preview flow.
 *
 * These live in their own module (no React / Next imports) so:
 *  1. They can be unit-tested in isolation.
 *  2. The print link is derived on the CLIENT, never passed as a function prop
 *     from a Server Component — passing a function across the server→client
 *     boundary is not serializable and throws at render time
 *     ("Functions cannot be passed directly to Client Components").
 */

/** Minimal shape needed to build a print/preview link. */
export interface PrintLinkEntry {
  period: string;
  staff: { id: string };
}

/**
 * Builds the DOCX export link for a Borang entry.
 *
 * Returns `null` when the entry lacks a staff id or a valid `YYYY-MM` period,
 * so callers can safely skip rendering the preview action.
 */
export function printHrefFor(entry: PrintLinkEntry | null | undefined): string | null {
  if (!entry || !entry.staff?.id || !entry.period) return null;
  const year = entry.period.slice(0, 4);
  if (!/^\d{4}$/.test(year)) return null;
  return `/api/borang/export?staffId=${encodeURIComponent(entry.staff.id)}&year=${year}`;
}
