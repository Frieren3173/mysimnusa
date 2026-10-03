"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, DocumentStatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { formatDateShort } from "@/lib/utils";

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
  documents: {
    id: string;
    number: string | null;
    expiryDate: string | null;
    isLifetime: boolean;
    status: string;
    documentType: { name: string; code: string };
  }[];
  competencies: { id: string; competency: { name: string } }[];
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Tutup"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detail Tenaga"
        className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-lg bg-white shadow-xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
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

        <div className="space-y-4 p-5">
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
                    <div className="h-14 w-14 shrink-0 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-500">
                      {staff.name.charAt(0)}
                    </div>
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

              {/* Legal documents */}
              <Card>
                <CardHeader>
                  <CardTitle>Dokumen Legalitas (STR &amp; SIP)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <Th>Jenis Dokumen</Th>
                        <Th>Nomor Dokumen</Th>
                        <Th>Tanggal Berakhir</Th>
                        <Th>Status</Th>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.documents.length === 0 ? (
                        <TableRow>
                          <Td colSpan={4} className="text-center text-xs text-slate-400 py-6">
                            Belum ada dokumen legalitas yang diunggah.
                          </Td>
                        </TableRow>
                      ) : (
                        staff.documents.map((doc) => (
                          <TableRow key={doc.id}>
                            <Td className="font-medium text-slate-900">{doc.documentType.name}</Td>
                            <Td className="font-mono text-xs">{doc.number ?? "—"}</Td>
                            <Td>{formatDateShort(doc.expiryDate)}</Td>
                            <Td>
                              <DocumentStatusBadge
                                status={doc.status}
                                label={
                                  doc.documentType.code === "STR" && doc.status === "ACTIVE"
                                    ? "Belum Seumur Hidup"
                                    : undefined
                                }
                              />
                            </Td>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Competencies */}
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
                        <Badge key={c.id} variant="default" showDot={false}>
                          {c.competency.name}
                        </Badge>
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
