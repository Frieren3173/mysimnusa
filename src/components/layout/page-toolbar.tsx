/**
 * Shared, client-safe styling tokens for page toolbars.
 *
 * These live in their own module (no `"use client"`) so both server components
 * (page files) and client components can import them without hitting the
 * "cannot call a client function from the server" boundary error.
 */

/** Shared input styling for search fields. */
export function searchInputClass(width = "w-56"): string {
  return `h-8 ${width} rounded-md border border-[var(--color-border)] bg-white px-3 text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/70 transition-colors hover:border-[var(--color-border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-[var(--color-primary)]`;
}

/** Shared styling for filter selects. */
export const filterSelectClass =
  "h-8 rounded-md border border-[var(--color-border)] bg-white px-2 text-xs text-[var(--color-foreground)] transition-colors hover:border-[var(--color-border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-[var(--color-primary)]";
