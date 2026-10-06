"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable confirmation dialog.
 *
 * Follows the MYSIMNUSA dialog pattern (overlay + role="dialog" + Escape +
 * focus handling + body scroll lock) and is portalled to `document.body` so it
 * always paints above the sticky header and any page content.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  /** Optional extra content (e.g. an identity summary list). */
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const closeRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  React.useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Tutup"
        onClick={() => !busy && onCancel()}
        className="animate-overlay-in absolute inset-0 cursor-default bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-dialog-in relative flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
      >
        <div className="flex items-start gap-3 px-5 py-4">
          <div
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-full",
              tone === "danger"
                ? "bg-[var(--color-danger-subtle)] text-[var(--color-danger)]"
                : "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]",
            )}
          >
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[var(--color-foreground)]">{title}</h2>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                {description}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Tutup"
            className="shrink-0 rounded-md p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        {children && <div className="px-5 pb-4">{children}</div>}

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-raised)]/50 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-[var(--color-border)] bg-white px-3.5 py-1.5 text-xs font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-raised)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-[filter] hover:brightness-95 disabled:opacity-60",
              tone === "danger" ? "bg-[var(--color-danger)]" : "bg-[var(--color-primary)]",
            )}
          >
            {busy ? "Memproses…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
