"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  DocumentDetailModal,
  type DocumentFile,
} from "@/components/ui/document-detail-modal";

/**
 * Clickable document badge/status.
 *
 * Renders a status-styled badge that opens the shared DocumentDetailModal for
 * the given staff + document type. Availability is decided by the file
 * reference, so every status (Aktif / Akan Berakhir / Expired / Seumur Hidup /
 * Tanpa Kedaluwarsa) is clickable — the badge shows validity, not openability.
 *
 * `files` must belong to THIS staff + document type (the caller is responsible
 * for correct grouping; the modal never substitutes another type).
 */
export function DocumentBadgeButton({
  staffName,
  title,
  files,
  label,
  variant,
  title_attr,
}: {
  staffName: string;
  title: string;
  files: DocumentFile[];
  label: string;
  variant?: React.ComponentProps<typeof Badge>["variant"];
  title_attr?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const hasFiles = files.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => hasFiles && setOpen(true)}
        disabled={!hasFiles}
        title={title_attr ?? (hasFiles ? `Lihat detail ${title}` : `Belum ada data ${title}`)}
        className={
          hasFiles
            ? "cursor-pointer rounded-full transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-1"
            : "cursor-default"
        }
      >
        <Badge variant={variant}>{label}</Badge>
      </button>
      {open && hasFiles && (
        <DocumentDetailModal
          staffName={staffName}
          title={title}
          files={files}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
