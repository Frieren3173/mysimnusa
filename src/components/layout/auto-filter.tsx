"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Shared auto-applying filter form (owner revision: filters/search update the
 * results automatically — no "Terapkan" click required).
 *
 * Behaviour:
 *  • <select> and date inputs apply IMMEDIATELY on change.
 *  • Text inputs (type=search/text with [data-autofilter-debounce]) apply after a
 *    short debounce so typing does not fire a request per keystroke.
 *  • The current page is reset whenever a filter changes (drop the `page` key).
 *  • State stays in the URL (searchParams) so the server re-renders — consistent
 *    with the existing ServerPagination / server-filter architecture.
 *  • A "+ debounce" submit also triggers on Enter (native form submit) and the
 *    visible button remains as an accessible fallback.
 *
 * Delivery: uses the native GET form + `requestSubmit()`, so it works without
 * any client-side data layer and never double-fetches.
 */
export function AutoFilter({
  action,
  children,
  debounceMs = 350,
  className,
}: {
  action: string;
  children: React.ReactNode;
  debounceMs?: number;
  className?: string;
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = React.useRef(false);

  // Drop the page key so a changed filter always goes back to page 1.
  function submit() {
    const form = formRef.current;
    if (!form) return;
    const pageInput = form.querySelector<HTMLInputElement>('input[name="page"]');
    if (pageInput) pageInput.value = "1";
    form.requestSubmit();
  }

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(submit, debounceMs);
  }

  // Immediate apply for selects / dates; debounced apply for text inputs.
  function onChange(e: React.FormEvent<HTMLFormElement>) {
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    const type = (target as HTMLInputElement).type;
    if (tag === "SELECT" || type === "date" || type === "month") {
      submit();
    } else if (type === "search" || type === "text") {
      if (composing.current) return; // don't fire mid-IME-composition
      schedule();
    }
  }

  return (
    <form
      ref={formRef}
      action={action}
      method="GET"
      role="search"
      className={className}
      onChange={onChange}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => {
        composing.current = false;
        schedule();
      }}
      onSubmit={(e) => {
        // Let the native GET navigation handle the actual submission.
        void e;
        router.prefetch(action);
      }}
    >
      {/* Ensures a changed filter resets to page 1 even on native submit. */}
      <input type="hidden" name="page" defaultValue="1" />
      {children}
    </form>
  );
}
