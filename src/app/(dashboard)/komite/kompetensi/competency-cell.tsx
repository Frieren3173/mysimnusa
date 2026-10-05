"use client";

import * as React from "react";
import { X, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Competency badge.
 *
 * Two distinct layers are surfaced:
 *   1. The competency itself (from the legacy spreadsheet) — always shown.
 *   2. The certificate file (from migrated Documents) — shown when available.
 *
 * A competency whose certificate was outside the earlier file migration still
 * appears here; clicking it clearly states the file is not yet available.
 */

export type CertificateInfo = {
  id: string;
  filename: string | null;
  expiryDate: string | null;
} | null;

export function CompetencyBadgeButton({
  staffName,
  code,
  label,
  certificate,
}: {
  staffName: string;
  code: string;
  label: string;
  certificate: CertificateInfo;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        style={{ backgroundColor: "#EFF6FF", color: "#1D4ED8" }}
        title={label}
      >
        {label}
        {!certificate && <AlertCircle className="h-3 w-3 opacity-60" aria-hidden="true" />}
      </button>

      {open && (
        <CompetencyModal
          staffName={staffName}
          code={code}
          label={label}
          certificate={certificate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function CompetencyModal({
  staffName,
  code,
  label,
  certificate,
  onClose,
}: {
  staffName: string;
  code: string;
  label: string;
  certificate: CertificateInfo;
  onClose: () => void;
}) {
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
        className="relative w-full max-w-md rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Detail Kompetensi</h2>
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

          <div className="rounded-md border border-slate-200 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Status data</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Kompetensi tercatat pada data sumber
            </p>
          </div>

          {certificate ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-800">
                    {certificate.filename ?? `${label} — sertifikat`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {certificate.expiryDate
                      ? `Berakhir: ${new Date(certificate.expiryDate).toLocaleDateString("id-ID")}`
                      : "Tanpa tanggal berakhir"}
                  </p>
                </div>
              </div>
              <a
                href={`/api/documents/${certificate.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Buka Sertifikat
              </a>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Data kompetensi tersedia, tetapi file sertifikat belum tersedia di penyimpanan MYSIMNUSA.
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
    </div>
  );
}
