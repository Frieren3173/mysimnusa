"use client";

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
 * It also publishes its measured height to `--page-sticky-offset` on <html>, so
 * a table's bounded scroll container can size itself correctly (app header +
 * topbar + this header) on both desktop and mobile.
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
  const ref = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => {
      // Height of this sticky header + the fixed chrome above it (topbar).
      const topbar = document.querySelector("[data-app-topbar]") as HTMLElement | null;
      const offset = el.offsetHeight + (topbar?.offsetHeight ?? 0) + 16;
      document.documentElement.style.setProperty("--page-sticky-offset", `${offset}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publish);
    };
  }, []);

  return (
    <header
      ref={ref}
      className={cn(
        "sticky top-0 z-20 -mx-4 mb-4 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-background)]/80 md:-mx-6 md:px-6",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-[var(--color-foreground)]">{title}</h1>
          {description ? (
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{description}</p>
          ) : null}
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
