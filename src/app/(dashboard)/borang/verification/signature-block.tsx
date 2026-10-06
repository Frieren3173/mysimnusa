import * as React from "react";
import { KASI_KEPERAWATAN, KEPALA_RUANGAN, PERAWAT_PEMOHON_POSITION } from "@/lib/borang";

/**
 * Three-column signature block, left → right:
 *   1. Kepala Seksi Keperawatan dan Kebidanan (fixed)
 *   2. Kepala Ruangan (blank — filled by hand)
 *   3. Perawat yang meminta (from the requesting staff)
 *
 * This mirrors the layout generated in the DOCX export so the on-screen
 * preview matches the printed document.
 */
export function SignatureBlock({
  perawatName,
  perawatNip,
  dateLine,
}: {
  perawatName: string;
  perawatNip: string | null;
  dateLine?: string;
}) {
  const columns: { position: string; name: string; nip: string; underline?: boolean }[] = [
    {
      position: KASI_KEPERAWATAN.position,
      name: KASI_KEPERAWATAN.name,
      nip: `NIP. ${KASI_KEPERAWATAN.nip}`,
    },
    {
      position: KEPALA_RUANGAN.position,
      name: KEPALA_RUANGAN.name || "………………………………",
      nip: KEPALA_RUANGAN.nip ? `NIP. ${KEPALA_RUANGAN.nip}` : "NIP. ………………………",
    },
    {
      position: PERAWAT_PEMOHON_POSITION,
      name: perawatName,
      nip: `NIP. ${perawatNip ?? "………………………"}`,
    },
  ];

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      {dateLine ? (
        <p className="mb-4 text-right text-xs text-[var(--color-muted-foreground)]">{dateLine}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {columns.map((c) => (
          <div key={c.position} className="text-center">
            <p className="text-[11px] font-semibold uppercase leading-snug tracking-wide text-[var(--color-foreground)]">
              {c.position}
            </p>
            {/* Signature area */}
            <div className="h-20" aria-hidden="true" />
            <p className="border-t border-dashed border-[var(--color-border-strong)] pt-1.5 text-xs font-medium text-[var(--color-foreground)]">
              {c.name}
            </p>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">{c.nip}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
