"use client";

import * as React from "react";
import { X, Users } from "lucide-react";
import { expandPatientRows } from "@/lib/borang";

/**
 * Patient-list popup for a single Borang entry.
 *
 * Shows the anonymised patients derived from the entry's action quantity
 * (qty → that many rows, each JUMLAH = 1, each with a unique 6-digit No. RM).
 * Nothing is persisted — the list is derived deterministically, so the modal,
 * the logbook and the generated DOCX all agree.
 *
 * Follows the MYSIMNUSA dialog pattern (see image-preview.tsx /
 * staff-detail-modal.tsx): overlay + role="dialog" + Escape + focus handling.
 */
interface ModalEntry {
  id: string;
  period: string;
  patientIdentifier: string;
  rmNumber: string | null;
  actionType: string;
  quantity: number;
  staff: { name: string };
  room: { name: string } | null;
}

export function PatientListModal({
  entry,
  onClose,
}: {
  entry: ModalEntry;
  onClose: () => void;
}) {
  const closeRef = React.useRef<HTMLButtonElement | null>(null);

  const patients = React.useMemo(
    () =>
      expandPatientRows([
        {
          period: entry.period,
          patientIdentifier: entry.patientIdentifier,
          rmNumber: entry.rmNumber,
          actionType: entry.actionType,
          quantity: entry.quantity,
        },
      ]),
    [entry],
  );

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

  // Focus the close button on open.
  React.useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    // z-[60] keeps the popup above the topbar dropdown (z-50) and page content.
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Tutup daftar pasien"
        onClick={onClose}
        className="animate-overlay-in absolute inset-0 cursor-default bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Daftar Pasien"
        className="animate-dialog-in relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
              <Users size={16} className="text-[var(--color-primary)]" aria-hidden="true" />
              Daftar Pasien
            </h2>
            <p className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">
              {entry.staff.name}
              {entry.room?.name ? ` · ${entry.room.name}` : ""} · {entry.actionType} · Total{" "}
              <span className="font-medium text-[var(--color-foreground)]">{patients.length}</span> pasien
            </p>
          </div>
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

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--color-surface-raised)] [&>tr>th]:bg-[var(--color-surface-raised)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className="w-12 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">No</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Nama Pasien</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">No. RM</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Tindakan</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {patients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-xs text-[var(--color-muted-foreground)]">
                    Belum ada data pasien.
                  </td>
                </tr>
              ) : (
                patients.map((p) => (
                  <tr key={`${p.no}-${p.rmNumber}`} className="transition-colors hover:bg-[var(--color-primary-subtle)]/50">
                    <td className="px-4 py-2.5 text-xs tabular-nums text-[var(--color-muted-foreground)]">{p.no}</td>
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-[var(--color-foreground)]">{p.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-foreground)]/80">{p.rmNumber}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-foreground)]/90">{p.actionType}</td>
                    <td className="px-4 py-2.5 text-center text-xs tabular-nums text-[var(--color-foreground)]/90">{p.quantity}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3">
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            {patients.length} pasien · No. RM unik, tidak berurutan
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-raised)]"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
