"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { formatDateShort } from "@/lib/utils";
import { deriveValidity, isDocumentAvailable, VALIDITY_META } from "@/lib/documents";
import { DocumentBadgeButton } from "@/components/ui/document-badge-button";
import { StaffPhoto } from "./staff-photo";

interface StaffDoc {
  id: string;
  number: string | null;
  expiryDate: string | null;
  isLifetime: boolean;
  status: string;
  storageKey?: string | null;
  legacyDriveUrl?: string | null;
  filename?: string | null;
  documentType: { name: string; code: string; hasExpiry?: boolean };
}

interface StaffDetail {
  id: string;
  name: string;
  nip: string | null;
  profession: string;
  address: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  employmentStatus: string;
  legacySourceId: string | null;
  room: { name: string } | null;
  documents: StaffDoc[];
  competencies: {
    id: string;
    certNumber?: string | null;
    expiryDate?: string | null;
    documentUrl?: string | null;
    competency: { name: string; code?: string };
  }[];
}

function ageFrom(dob: string | null): string {
  if (!dob) return "—";
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return `${age} tahun`;
}

export function StaffDetailButton({
  staffId,
  children,
}: {
  staffId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left font-medium text-slate-900 hover:underline"
      >
        {children}
      </button>
      {open && <StaffDetailModal staffId={staffId} onClose={() => setOpen(false)} />}
    </>
  );
}

function StaffDetailModal({ staffId, onClose }: { staffId: string; onClose: () => void }) {
  const [staff, setStaff] = React.useState<StaffDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/komite/staff/${staffId}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? "Gagal memuat data");
        }
        if (!cancelled) setStaff(json.data.staff);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button
        type="button"
        aria-label="Tutup"
        onClick={onClose}
        className="fixed inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detail Tenaga"
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Detail Tenaga</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {loading && (
            <p className="py-8 text-center text-xs text-slate-500">Memuat data tenaga...</p>
          )}
          {error && <p className="py-8 text-center text-xs text-red-600">{error}</p>}

          {staff && (
            <>
              {/* Profile */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-center gap-4">
                    <StaffPhoto name={staff.name} photoDocId={staff.documents.find((d) => d.documentType.code === "FOTO")?.id ?? null} size="lg" />
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900">{staff.name}</h3>
                      <p className="text-xs text-slate-500">
                        {staff.profession} · {staff.room?.name ?? "Tanpa Ruangan"} · NIP:{" "}
                        <span className="font-mono text-slate-700">{staff.nip ?? "—"}</span>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant={staff.employmentStatus === "ACTIVE" ? "active" : "default"}>
                          {staff.employmentStatus === "ACTIVE" ? "Aktif" : staff.employmentStatus}
                        </Badge>
                        {staff.legacySourceId && (
                          <Badge variant="default" showDot={false}>
                            Data Migrasi
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Link href={`/komite/staff/${staff.id}/edit`} className="shrink-0">
                    <Button variant="secondary" size="sm">
                      Edit Profil
                    </Button>
                  </Link>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-slate-400">Tanggal Lahir</dt>
                    <dd className="text-slate-700">
                      {formatDateShort(staff.dateOfBirth)} · {ageFrom(staff.dateOfBirth)}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-slate-400">Nomor HP</dt>
                    <dd className="font-mono text-slate-700">{staff.phone ?? "—"}</dd>
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <dt className="w-28 shrink-0 text-slate-400">Alamat</dt>
                    <dd className="text-slate-700">{staff.address ?? "—"}</dd>
                  </div>
                </dl>
              </div>

              {/* Documents — grouped by type, clickable validity badge opens the
                  shared detail modal (availability from the file reference). */}
              <Card>
                <CardHeader>
                  <CardTitle>Dokumen</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <StaffDocumentsTable staffName={staff.name} documents={staff.documents} />
                </CardContent>
              </Card>

              {/* Competencies — clickable; opens the certificate file when the
                  staff has one registered. */}
              <Card>
                <CardHeader>
                  <CardTitle>Kompetensi Klinis</CardTitle>
                </CardHeader>
                <CardContent>
                  {staff.competencies.length === 0 ? (
                    <p className="text-xs italic text-slate-400">
                      Belum ada kompetensi terdaftar.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {staff.competencies.map((c) => (
                        <DocumentBadgeButton
                          key={c.id}
                          staffName={staff.name}
                          title={c.competency.name}
                          variant="default"
                          label={c.competency.name}
                          files={
                            c.documentUrl
                              ? [
                                  {
                                    id: c.documentUrl,
                                    filename: `${c.competency.name} — sertifikat`,
                                    legacyDriveUrl: c.documentUrl,
                                    expiryDate: c.expiryDate ?? null,
                                    hasExpiry: true,
                                  },
                                ]
                              : []
                          }
                          title_attr={
                            c.documentUrl
                              ? `${c.competency.name} — klik untuk buka sertifikat`
                              : `${c.competency.name} — berkas belum tersedia`
                          }
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Groups a staff member's documents by type and renders one row per type.
 * The validity badge is clickable and opens the shared document modal, which
 * lists every file for that type. Availability is decided by the file
 * reference, so an Expired (or non-expiring) document can still be opened.
 */
function StaffDocumentsTable({ staffName, documents }: { staffName: string; documents: StaffDoc[] }) {
  if (documents.length === 0) {
    return (
      <p className="px-5 py-6 text-center text-xs text-slate-400">
        Belum ada dokumen yang diunggah.
      </p>
    );
  }

  const byType = new Map<string, StaffDoc[]>();
  for (const d of documents) {
    const list = byType.get(d.documentType.code) ?? [];
    list.push(d);
    byType.set(d.documentType.code, list);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>Jenis Dokumen</Th>
          <Th>Berkas</Th>
          <Th>Berlaku Hingga</Th>
          <Th>Status</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...byType.entries()].map(([code, docs]) => {
          const primary = docs.find(isDocumentAvailable) ?? docs[0];
          const validity = deriveValidity({
            expiryDate: primary.expiryDate,
            isLifetime: primary.isLifetime,
            hasExpiry: primary.documentType.hasExpiry,
          });
          const meta = VALIDITY_META[validity];
          const label =
            code === "STR" && validity === "ACTIVE" ? "Belum Seumur Hidup" : meta.label;
          return (
            <TableRow key={code}>
              <Td className="font-medium text-slate-900">{primary.documentType.name}</Td>
              <Td className="text-xs text-slate-600">
                {docs.filter(isDocumentAvailable).length > 0 ? (
                  <span>
                    {docs.filter(isDocumentAvailable).length} berkas
                  </span>
                ) : (
                  <span className="italic text-slate-400">Belum tersedia</span>
                )}
              </Td>
              <Td className="text-xs">
                {primary.isLifetime
                  ? "Seumur Hidup"
                  : primary.documentType.hasExpiry === false || !primary.expiryDate
                    ? "Tanpa tanggal berakhir"
                    : formatDateShort(primary.expiryDate)}
              </Td>
              <Td>
                <DocumentBadgeButton
                  staffName={staffName}
                  title={primary.documentType.name}
                  files={docs.map((d) => ({
                    id: d.id,
                    filename: d.filename,
                    storageKey: d.storageKey,
                    legacyDriveUrl: d.legacyDriveUrl,
                    expiryDate: d.expiryDate,
                    isLifetime: d.isLifetime,
                    hasExpiry: d.documentType.hasExpiry,
                    documentTypeCode: code,
                    documentTypeName: primary.documentType.name,
                  }))}
                  label={label}
                  variant={meta.variant}
                />
              </Td>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
