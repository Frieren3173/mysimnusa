"use client";

import * as React from "react";
import { X, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Clickable competency cell. Opens a dialog listing the staff member's
 * certificates for that competency, loaded on demand from the application API
 * (never directly from Google Drive).
 */

type Cert = {
  id: string;
  filename: string | null;
  expiryDate: string | null;
  isLifetime: boolean;
  status: string;
  hasFile: boolean;
};

const STATUS_VARIANT: Record<string, "active" | "expiring" | "expired"> = {
  ACTIVE: "active",
  EXPIRING: "expiring",
  EXPIRED: "expired",
  LIFETIME: "active",
  MISSING: "expired",
};

export function CompetencyCellButton({
  staffId,
  staffName,
  code,
  label,
  children,
}: {
  staffId: string;
  staffName: string;
  code: string;
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        aria-label={`Lihat sertifikat ${label} untuk ${staffName}`}
      >
        {children}
      </button>
      {open && (
        <CompetencyModal
          staffId={staffId}
          staffName={staffName}
          code={code}
          label={label}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function CompetencyModal({
  staffId,
  staffName,
  code,
  label,
  onClose,
}: {
  staffId: string;
  staffName: string;
  code: string;
  label: string;
  onClose: () => void;
}) {
  const [certs, setCerts] = React.useState<Cert[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/komite/staff/${staffId}/documents?type=${encodeURIComponent(code)}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Gagal memuat sertifikat");
        if (!cancelled) setCerts(json.data?.documents ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat sertifikat");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId, code]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Tutup" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Kompetensi ${label}`}
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-lg bg-white shadow-xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Kompetensi {label}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-slate-200 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Tenaga</p>
              <p className="font-medium text-slate-800">{staffName}</p>
            </div>
            <div className="rounded-md border border-slate-200 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Kompetensi</p>
              <p className="font-medium text-slate-800">{label}</p>
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {!error && certs === null && <p className="text-xs text-slate-400">Memuat sertifikat…</p>}
          {!error && certs?.length === 0 && (
            <p className="text-xs text-slate-400">Tidak ada dokumen untuk kompetensi ini.</p>
          )}

          {certs && certs.length > 0 && (
            <ul className="space-y-2">
              {certs.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-800">
                        {c.filename ?? `${label} — sertifikat`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {c.isLifetime
                          ? "Seumur hidup"
                          : c.expiryDate
                            ? `Berakhir: ${new Date(c.expiryDate).toLocaleDateString("id-ID")}`
                            : "Tanpa tanggal berakhir"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={STATUS_VARIANT[c.status] ?? "expiring"}>{c.status}</Badge>
                    {c.hasFile && (
                      <a
                        href={`/api/documents/${c.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Buka
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
