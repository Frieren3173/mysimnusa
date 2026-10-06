"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable image preview (lightbox).
 *
 * Renders a trigger (or renders nothing when `disabled`) and, when activated,
 * mounts an accessible modal that shows the image at full size. The image is
 * loaded lazily only when the modal first opens, and reuses the caller's
 * existing `src` (no new requests or endpoints).
 *
 * Behaviour
 *  - Closes on: close button, overlay click, Escape key.
 *  - Does NOT close when the image itself is clicked.
 *  - Locks page scrolling while open and restores it on close.
 *  - Moves focus into the dialog on open and back to the trigger on close.
 *
 * Accessibility
 *  - The trigger is a real <button> with an aria-label.
 *  - The dialog uses role="dialog" aria-modal="true" with an accessible label.
 *
 * This follows the dialog pattern already used in MYSIMNUSA (see
 * staff-detail-modal.tsx / competency-cell.tsx) so it feels native.
 */
export interface ImagePreviewProps {
  /** Full-resolution image source, loaded only when the preview opens. */
  src: string;
  /** Accessible description of the image, e.g. `Foto <nama>`. */
  alt: string;
  /** Rendered as the clickable trigger, normally the thumbnail. */
  children: React.ReactNode;
  /** Title shown in the dialog header. Defaults to `alt`. */
  title?: string;
  /** Prevents the trigger from opening the preview (e.g. no image). */
  disabled?: boolean;
  /** Extra classes for the trigger button. */
  triggerClassName?: string;
}

export function ImagePreview({
  src,
  alt,
  children,
  title,
  disabled = false,
  triggerClassName,
}: ImagePreviewProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Lihat ${alt.toLowerCase()}`}
        className={cn(
          "cursor-pointer rounded-full transition-transform duration-150",
          "hover:scale-105 hover:ring-2 hover:ring-[var(--color-primary)]/60 hover:ring-offset-1",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2",
          triggerClassName,
        )}
      >
        {children}
      </button>
      {open && (
        <ImagePreviewDialog
          src={src}
          alt={alt}
          title={title ?? alt}
          onClose={() => setOpen(false)}
          returnFocusTo={triggerRef}
        />
      )}
    </>
  );
}

function ImagePreviewDialog({
  src,
  alt,
  title,
  onClose,
  returnFocusTo,
}: {
  src: string;
  alt: string;
  title: string;
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
}) {
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  // The full-size image is fetched only when the modal opens (this <img> is the
  // sole consumer of `src`). Contents are hidden until it has decoded.
  const [loaded, setLoaded] = React.useState(false);

  // Close on Escape.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock page scroll while open; restore on close.
  React.useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Move focus into the dialog on open, and back to the trigger on close.
  React.useEffect(() => {
    const trigger = returnFocusTo.current;
    closeRef.current?.focus();
    return () => {
      trigger?.focus();
    };
  }, [returnFocusTo]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay — a button so keyboard/pointer users can dismiss it. */}
      <button
        type="button"
        aria-label="Tutup pratinjau foto"
        onClick={onClose}
        className="animate-overlay-in absolute inset-0 cursor-default bg-black/70 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-dialog-in relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <h2 className="truncate text-sm font-semibold text-[var(--color-foreground)]">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="shrink-0 rounded-md p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Clicking the padding around the image also closes; clicking the
            image itself does not (stopPropagation). */}
        <button
          type="button"
          aria-label="Tutup pratinjau foto"
          onClick={onClose}
          className="relative flex min-h-0 flex-1 cursor-default items-center justify-center overflow-auto bg-[var(--color-surface-raised)] p-4"
        >
          {!loaded && (
            <span
              className="absolute flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]"
              role="status"
            >
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-primary)]"
                aria-hidden="true"
              />
              Memuat foto…
            </span>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "max-h-[75vh] max-w-full rounded-lg object-contain shadow-sm transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        </button>
      </div>
    </div>
  );
}
