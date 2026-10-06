"use client";

import * as React from "react";
import { X, Users, FileText, Activity, CalendarRange } from "lucide-react";
import { BorangStatusBadge } from "@/components/ui/badge";
import { expandPatientRows, type PatientEntryInput } from "@/lib/borang";
import { PatientListModal } from "./patient-list-modal";

/**
 * Staff logbook detail — opened by clicking a nurse's name in the Borang
 * logbook. This is NOT a staff profile: it summarises that person's Borang
 * activity and lists their entries, with a "Daftar Pasien" action per entry that
 * reuses the existing PatientListModal.
 *
 * All numbers derive from the already-loaded entries (quantity → expanded
 * patient rows, JUMLAH = 1 each) — no extra API call, nothing persisted.
 */
export interface StaffLogbookEntry {
  id: string;
  period: string;
  patientIdentifier: string;
  rmNumber: string | null;
  actionType: string;
  quantity: number;
  status: string;
  room: { name: string } | null;
  staff: { id: string; name: string; profession: string; nip?: string | null };
}

const STATUS_ORDER: Record<string, number> = {
  DRAFT: 0,
  SUBMITTED: 1,
  VERIFICATION: 2,
  APPROVED: 3,
  REJECTED: 4,
  ARCHIVED: 5,
};

export function StaffLogbookModal({
  entries,
  onClose,
}: {
  entries: StaffLogbookEntry[];
  onClose: () => void;
}) {
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  const [patientEntry, setPatientEntry] = React.useState<StaffLogbookEntry | null>(null);

  const staff = entries[0]?.staff ?? null;
  const roomName =
    entries.find((e) => e.room?.name)?.room?.name ?? "—";

  // Summary — derive patient rows exactly like the modal/DOCX do.
  const summary = React.useMemo(() => {
    const periods = new Set<string>();
    let totalPatients = 0;
    let totalActions = 0;
    for (const e of entries) {
      periods.add(e.period);
      totalPatients += expandPatientRows([
        {
          period: e.period,
          patientIdentifier: e.patientIdentifier,
          rmNumber: e.rmNumber,
          actionType: e.actionType,
          quantity: e.quantity,
        } satisfies PatientEntryInput,
      ]).length;
      totalActions += e.quantity;
    }
    return {
      totalEntries: entries.length,
      totalPatients,
      totalActions,
      periods: [...periods].sort().reverse(),
    };
  }, [entries]);

  const sorted = React.useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          b.period.localeCompare(a.period) ||
          (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
      ),
    [entries],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !patientEntry) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, patientEntry]);

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

  return (
    <>
      {/* z-[60] keeps it above page content and the sticky header. */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <button
          type="button"
          aria-label="Tutup detail logbook petugas"
          onClick={onClose}
          className="animate-overlay-in absolute inset-0 cursor-default bg-black/60"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Logbook Petugas"
          className="animate-dialog-in relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
            <div className="flex items-center gap-3.5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white">
                {staff?.name?.charAt(0) ?? "U"}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                  {staff?.name ?? "Petugas"}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  {staff?.nip ? `NIP. ${staff.nip} · ` : ""}
                  {staff?.profession ?? "—"} · {roomName}
                </p>
              </div>
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

          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:grid-cols-4">
            <SummaryStat icon={<FileText size={15} />} label="Total Borang" value={summary.totalEntries} />
            <SummaryStat icon={<Users size={15} />} label="Total Pasien" value={summary.totalPatients} />
            <SummaryStat icon={<Activity size={15} />} label="Total Tindakan" value={summary.totalActions} />
            <SummaryStat
              icon={<CalendarRange size={15} />}
              label="Periode"
              value={summary.periods.length === 0 ? "—" : summary.periods.join(", ")}
              small
            />
          </div>

          {/* Logbook table */}
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--color-surface-raised)]">
                <tr className="border-b border-[var(--color-border)]">
                  {["Periode", "Tindakan", "Jumlah Pasien", "Ruangan", "Status", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-xs text-[var(--color-muted-foreground)]">
                      Belum ada entri logbook.
                    </td>
                  </tr>
                ) : (
                  sorted.map((e) => {
                    const patients = expandPatientRows([
                      {
                        period: e.period,
                        patientIdentifier: e.patientIdentifier,
                        rmNumber: e.rmNumber,
                        actionType: e.actionType,
                        quantity: e.quantity,
                      },
                    ]).length;
                    return (
                      <tr key={e.id} className="transition-colors hover:bg-[var(--color-primary-subtle)]/50">
                        <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-foreground)]/80">{e.period}</td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-foreground)]">{e.actionType}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-[var(--color-foreground)]/90">{patients}</td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-foreground)]/80">{e.room?.name ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <BorangStatusBadge status={e.status} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setPatientEntry(e)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-subtle)]"
                          >
                            <Users size={12} /> Daftar Pasien
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3">
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              {summary.totalEntries} entri · {summary.totalPatients} pasien
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

      {/* Reuse the existing patient-list modal for a chosen entry. */}
      {patientEntry && (
        <PatientListModal entry={patientEntry} onClose={() => setPatientEntry(null)} />
      )}
    </>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  small = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        <span className="text-[var(--color-primary)]">{icon}</span>
        {label}
      </div>
      <p
        className={
          small
            ? "mt-1 truncate text-[11px] font-medium text-[var(--color-foreground)]"
            : "mt-1 text-xl font-bold tabular-nums text-[var(--color-foreground)]"
        }
        title={small ? String(value) : undefined}
      >
        {value}
      </p>
    </div>
  );
}
