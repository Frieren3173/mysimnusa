"use client";

import * as React from "react";
import { FileText, AlertCircle } from "lucide-react";
import { DocumentDetailModal, type DocumentFile } from "@/components/ui/document-detail-modal";
import { isDocumentAvailable } from "@/lib/documents";

/**
 * "Buka Dokumen" action for the Dashboard lists.
 *
 * Renders a compact button that opens the shared DocumentDetailModal. When the
 * file exists (storageKey/legacyDriveUrl) it is openable; otherwise a clear
 * disabled state is shown — the button never fabricates availability.
 */
export function DocumentOpenButton({
  staffName,
  documentLabel,
  file,
}: {
  staffName: string;
  documentLabel: string;
  file: DocumentFile;
}) {
  const [open, setOpen] = React.useState(false);
  const available = isDocumentAvailable(file);

  return (
    <>
      <button
        type="button"
        disabled={!available}
        onClick={() => available && setOpen(true)}
        title={available ? `Buka ${documentLabel}` : "Berkas belum tersedia"}
        className={
          available
            ? "inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            : "inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] font-medium text-[var(--color-muted-foreground)] opacity-60"
        }
      >
        {available ? <FileText size={12} /> : <AlertCircle size={12} />}
        Buka
      </button>
      {open && available && (
        <DocumentDetailModal
          staffName={staffName}
          title={documentLabel}
          files={[file]}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
