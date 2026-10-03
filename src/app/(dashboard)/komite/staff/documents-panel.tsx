"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, FormField } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { UploadCloud, Trash2, ExternalLink, Download } from "lucide-react";

export interface FormDocument {
  id: string;
  code: string;
  typeName: string;
  number: string | null;
  expiryDate: string | null;
  isLifetime: boolean;
  status: string;
  hasLocalFile: boolean;
  legacyUrl: string | null;
  filename: string | null;
  fileSize: number | null;
}

interface Props {
  staffId: string;
  documents: FormDocument[];
}

const DOC_OPTIONS = [
  { code: "STR", name: "Surat Tanda Registrasi (STR)", expiry: true },
  { code: "SIP", name: "Surat Izin Praktik (SIP)", expiry: true },
  { code: "BTCLS", name: "BTCLS", expiry: true },
  { code: "ACLS", name: "ACLS", expiry: true },
  { code: "CV", name: "Curriculum Vitae", expiry: false },
  { code: "RKK", name: "Rincian Kewenangan Klinis", expiry: false },
  { code: "RKK_PREV", name: "RKK Sebelumnya", expiry: false },
  { code: "IJAZAH", name: "Ijazah", expiry: false },
  { code: "IJAZAH_VERIFY", name: "Verifikasi Ijazah", expiry: false },
  { code: "SURAT_PENGALAMAN", name: "Surat Pengalaman Kerja", expiry: false },
  { code: "FOTO", name: "Foto Profil", expiry: false },
];

const STATUS_VARIANT: Record<string, "active" | "expiring" | "expired" | "default" | "info"> = {
  ACTIVE: "active",
  EXPIRING: "expiring",
  EXPIRED: "expired",
  LIFETIME: "info",
  MISSING: "default",
};

export function DocumentsPanel({ staffId, documents }: Props) {
  const [list, setList] = React.useState(documents);
  const [code, setCode] = React.useState("STR");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [isLifetime, setIsLifetime] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const opt = DOC_OPTIONS.find((o) => o.code === code);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("code", code);
      if (isLifetime) fd.append("isLifetime", "true");
      if (expiryDate) fd.append("expiryDate", expiryDate);
      const res = await fetch(`/api/komite/staff/${staffId}/documents`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? "Gagal mengunggah");
      }
      const d = json.data.document;
      setList((prev) => [
        ...prev.filter((x) => !(x.code === d.documentType.code && d.number === x.number && x.expiryDate === d.expiryDate)),
        {
          id: d.id,
          code: d.documentType.code,
          typeName: d.documentType.name,
          number: d.number,
          expiryDate: d.expiryDate,
          isLifetime: d.isLifetime,
          status: d.status,
          hasLocalFile: Boolean(d.storageKey),
          legacyUrl: d.legacyDriveUrl ?? null,
          filename: d.filename,
          fileSize: d.fileSize,
        },
      ]);
      setFile(null);
      setExpiryDate("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunggah");
    } finally {
      setBusy(false);
    }
  }

  async function remove(docId: string) {
    if (!confirm("Hapus dokumen ini?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal menghapus");
      setList((prev) => prev.filter((d) => d.id !== docId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dokumen &amp; Berkas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Upload form */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-4">
            <FormField label="Jenis Dokumen">
              <Select value={code} onChange={(e) => setCode(e.target.value)} disabled={busy}>
                {DOC_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          {opt?.expiry && (
            <div className="sm:col-span-3">
              <FormField label="Berlaku Sampai">
                <input
                  type="date"
                  value={expiryDate}
                  disabled={isLifetime}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                />
              </FormField>
            </div>
          )}
          {opt?.expiry && (
            <div className="sm:col-span-2 pb-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isLifetime}
                  onChange={(e) => setIsLifetime(e.target.checked)}
                />
                Seumur hidup
              </label>
            </div>
          )}
          <div className="sm:col-span-3">
            <FormField label="File (PDF/Gambar, maks 15 MB)">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-slate-500 file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-2 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              />
            </FormField>
          </div>
          <div className="sm:col-span-12 flex justify-end">
            <Button variant="primary" size="sm" disabled={!file} loading={busy} onClick={upload}>
              <UploadCloud size={14} /> Unggah
            </Button>
          </div>
        </div>

        {/* Document list */}
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Jenis</Th>
              <Th>Nomor</Th>
              <Th>Berlaku Hingga</Th>
              <Th>Status</Th>
              <Th>Berkas</Th>
              <Th></Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 ? (
              <TableRow>
                <Td colSpan={6} className="text-center text-xs text-slate-400 py-6">
                  Belum ada dokumen.
                </Td>
              </TableRow>
            ) : (
              list.map((d) => (
                <TableRow key={d.id}>
                  <Td className="text-xs font-medium text-slate-800">{d.typeName}</Td>
                  <Td className="font-mono text-xs">{d.number ?? "—"}</Td>
                  <Td className="text-xs">
                    {d.isLifetime
                      ? "Seumur hidup"
                      : d.expiryDate
                        ? new Date(d.expiryDate).toLocaleDateString("id-ID")
                        : "—"}
                  </Td>
                  <Td>
                    <Badge variant={STATUS_VARIANT[d.status] ?? "default"}>{d.status}</Badge>
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {d.hasLocalFile ? (
                      <a
                        href={`/api/documents/${d.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <Download size={12} /> Unduh
                      </a>
                    ) : d.legacyUrl ? (
                      <a
                        href={d.legacyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <ExternalLink size={12} /> Drive
                      </a>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(d.id)}
                      disabled={busy}
                      title="Hapus dokumen"
                    >
                      <Trash2 size={14} className="text-red-500" />
                    </Button>
                  </Td>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
