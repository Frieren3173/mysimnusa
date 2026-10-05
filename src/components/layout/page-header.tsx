import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Sticky page header — one reusable pattern for every sidebar page.
 *
 * Renders the page title + description + actions, and optionally a toolbar
 * (search / filters) as a single sticky region:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ Title                                    │
 *   │ Description                    [Actions] │
 *   │ [Search] [Filter] [Filter] [Apply]       │
 *   └──────────────────────────────────────────┘
 *
 * The whole block sticks to the top of the app shell's scroll container while
 * the page content scrolls beneath it, so the title, description, actions and
 * filters all stay reachable.
 *
 * Sticky notes:
 *  - `top-0` inside `AppShell`'s `overflow-y-auto` main element.
 *  - Solid opaque background + bottom hairline + subtle shadow so scrolling
 *    content never bleeds through.
 *  - Negative horizontal margins cancel the shell padding, then re-apply it, so
 *    the bar spans the full width without a visible gap.
 */
export function StickyPageHeader({
  title,
  description,
  actions,
  toolbar,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {toolbar ? <div className="mt-3">{toolbar}</div> : null}
    </header>
  );
}

/** Horizontal toolbar row used inside the sticky header. */
export function PageToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
  );
}

/** Shared input styling for search fields. */
export function searchInputClass(width = "w-56"): string {
  return `h-8 ${width} rounded border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500`;
}

/** Shared styling for filter selects. */
export const filterSelectClass =
  "h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500";
