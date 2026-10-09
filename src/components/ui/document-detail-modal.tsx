"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X, FileText, AlertCircle, ExternalLink, Download, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  deriveValidity,
  isDocumentAvailable,
  documentSource,
  VALIDITY_META,
  type DocumentLike,
} from "@/lib/documents";

/**
 * Shared document detail modal — the MYSIMNUSA standard for Legalitas, Detail
 * SDM and the Dokumen menu (single source, mirrors the "Detail Kompetensi"
 * design).
 *
 * Behaviour
 *  - Centered in the viewport, height-capped, long lists scroll internally.
 *  - Header + close button stay reachable (sticky header).
 *  - The status badge reflects VALIDITY; availability (open button) is decided
 *    by the file reference, so an Expired document can still be opened.
 *  - Multiple files for one document type are listed (never a random pick).
 *  - Uses the existing authenticated `/api/documents/:id/download` route; no
 *    private storage URL is exposed.
 */

export interface DocumentFile extends DocumentLike {
  id: string;
  filename?: string | null;
  documentTypeName?: string;
  documentTypeCode?: string;
}

export function DocumentDetailModal({
  staffName,
  title,
  files,
  onClose,
}: {
  staffName: string;
  /** Document-type label, e.g. "STR" / "Ijazah". */
  title: string;
  /** One or more files for this document type (never empty here). */
  files: DocumentFile[];
  onClose: () => void;
}) {
  const closeRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  React.useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  React.useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Prefer the most-available file for the single-file summary, but always list
  // every file below. The primary drives the headline status.
  const primary = files.find((f) => isDocumentAvailable(f)) ?? files[0];
  const validity = deriveValidity(primary);
  const meta = VALIDITY_META[validity];
  const code = primary?.documentTypeCode ?? title;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Tutup"
        onClick={onClose}
        className="animate-overlay-in absolute inset-0 cursor-default bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detail ${title}`}
        className="animate-dialog-in relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
      >
        {/* Sticky header — always reachable, never clipped by the app topbar. */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <h2 className="truncate text-sm font-semibold text-[var(--color-foreground)]">
            Detail {title}
          </h2>
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

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-[var(--color-border)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Tenaga
              </p>
              <p className="font-medium text-[var(--color-foreground)]">{staffName}</p>
            </div>
            <div className="rounded-md border border-[var(--color-border)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Jenis
              </p>
              <p className="font-medium text-[var(--color-foreground)]">{title}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-[var(--color-border)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Berlaku Hingga
              </p>
              <p className="mt-0.5 font-medium text-[var(--color-foreground)]">
                {primary?.isLifetime
                  ? "Seumur Hidup"
                  : primary?.hasExpiry === false || !primary?.expiryDate
                    ? "Tanpa tanggal berakhir"
                    : new Date(primary.expiryDate).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
              </p>
            </div>
            <div className="rounded-md border border-[var(--color-border)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Status
              </p>
              <div className="mt-1">
                <Badge variant={meta.variant}>{meta.label}</Badge>
              </div>
            </div>
          </div>

          {/* Files */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Berkas ({files.length})
            </p>
            <ul className="space-y-2">
              {files.map((f) => {
                const available = isDocumentAvailable(f);
                const source = documentSource(f);
                return (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[var(--color-foreground)]">
                          {f.filename ?? `${title} — berkas`}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
                          {available ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                              {source === "drive" ? "Tersedia (Drive)" : "Tersedia"}
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-3 w-3 text-amber-600" aria-hidden="true" />
                              Berkas belum tersedia
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    {available ? (
                      <a
                        href={`/api/documents/${f.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-foreground)] transition-colors",
                          "hover:bg-[var(--color-surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
                        )}
                      >
                        {source === "drive" ? (
                          <>
                            <ExternalLink size={12} /> Buka Dokumen
                          </>
                        ) : (
                          <>
                            <Download size={12} /> Buka Dokumen
                          </>
                        )}
                      </a>
                    ) : (
                      <span className="shrink-0 text-[11px] italic text-[var(--color-muted-foreground)]">
                        Tidak dapat dibuka
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {files.length > 0 && !files.some(isDocumentAvailable) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Data dokumen tercatat, tetapi berkasnya belum tersedia di penyimpanan MYSIMNUSA.
                Hubungi administrator untuk mengunggah atau menyinkronkan berkas.
              </span>
            </div>
          )}

          <div className="flex justify-end">
            <Badge variant="default" showDot={false}>
              {code}
            </Badge>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
