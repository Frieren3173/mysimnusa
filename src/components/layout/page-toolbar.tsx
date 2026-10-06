/**
 * Shared, client-safe styling tokens for page toolbars.
 *
 * These live in their own module (no `"use client"`) so both server components
 * (page files) and client components can import them without hitting the
 * "cannot call a client function from the server" boundary error.
 */

/** Shared input styling for search fields. */
export function searchInputClass(width = "w-56"): string {
  return `h-8 ${width} rounded border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500`;
}

/** Shared styling for filter selects. */
export const filterSelectClass =
  "h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500";
