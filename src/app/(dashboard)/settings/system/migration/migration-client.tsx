"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/form";
import { DOCUMENT_TYPES, COMPETENCIES } from "@/lib/constants";
import {
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  RefreshCw,
  FileSpreadsheet,
  Play,
  ArrowRight,
} from "lucide-react";

// ─── API helper ─────────────────────────────────

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? `Request gagal (HTTP ${res.status})`);
  }
  return json.data as T;
}

// ─── Types ─────────────────────────────────────

interface Mapping {
  sourceField: string;
  targetField: string;
  isIgnored: boolean;
  confidence: number | null;
}

interface Scan {
  fileName: string;
  sheets: { name: string; rowCount: number; headers: string[] }[];
  primarySheet: string;
  samples: Record<string, string>;
  totalRows: number;
  warnings: string[];
}

interface Batch {
  id: string;
  status: string;
  isDryRun: boolean;
  sourceType: string;
  sourceReference: string;
  sourceCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  warningCount: number;
  duplicateCount: number;
  createdAt: string;
  scanResult?: Scan | null;
  fieldMappings?: Mapping[];
}

interface ValidateResult {
  sourceCount: number;
  valid: number;
  create: number;
  update: number;
  duplicates: number;
  failed: number;
  warnings: number;
}

interface DryRunResult {
  plannedItems: number;
  create: number;
  update: number;
  skip: number;
  failed: number;
  note: string | null;
}

interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  docsImported: number;
  processed: number;
}

interface Reconciliation {
  sourceStaffCount: number;
  targetStaffCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  duplicateCandidates: number;
  sourceDocumentCount: number;
  documentsImported: number;
  recordsMissingDocs: number;
  successCount: number;
  failedItems: { id: string; sourceId: string; errorCode: string | null; errorMessage: string | null }[];
  duplicateItems: { id: string; sourceId: string; reason: string | null }[];
}

interface ItemCount {
  PENDING?: number;
  SUCCESS?: number;
  FAILED?: number;
  DUPLICATE_REVIEW?: number;
  SKIPPED?: number;
}

interface AssessResult {
  rowsAssessed: number;
  staffNew: number;
  staffAlready: number;
  docsTotal: number;
  docsAlready: number;
  docsNew: number;
  actionableRows: number;
  rows: {
    sourceId: string;
    name: string;
    staffExists: boolean;
    docsNew: number;
    newDocCodes: string[];
  }[];
}

// ─── Stepper (PRD 14.2, Google sumber diaktivasi Fase 5) ──

const STEPS = ["Sumber Data", "Pemetaan Field", "Validasi", "Dry Run", "Import", "Rekonsiliasi"];

function stepForStatus(status: string, batch: Batch | null): number {
  if (status === "FAILED" && (batch?.sourceCount ?? 0) === 0) return 0;
  switch (status) {
    case "SCANNING":
    case "SCANNED":
    case "MAPPING_REVIEW":
      return 1;
    case "VALIDATING":
    case "READY":
      return batch?.isDryRun ? 3 : 2;
    case "IMPORTING":
      return 4;
    case "COMPLETED":
    case "FAILED":
      return 4;
    case "RECONCILING":
    case "RECONCILED":
      return 5;
    default:
      return 0;
  }
}

// ─── Target field options ──────────────────────

const DOC_ROLES = [
  { value: "file", label: "Tautan/berkas" },
  { value: "expiry", label: "Masa berakhir" },
  { value: "expiryAlt", label: "Jika seumur hidup" },
  { value: "number", label: "Nomor dokumen" },
];

function targetGroups(): { label: string; items: { value: string; label: string }[] }[] {
  return [
    {
      label: "Data Staf",
      items: [
        { value: "staff.name", label: "staff.name" },
        { value: "staff.nip", label: "staff.nip" },
        { value: "staff.email", label: "staff.email" },
        { value: "staff.phone", label: "staff.phone" },
        { value: "staff.address", label: "staff.address" },
        { value: "staff.dateOfBirth", label: "staff.dateOfBirth" },
        { value: "staff.profession", label: "staff.profession" },
        { value: "staff.room", label: "staff.room" },
        { value: "staff.photoUrl", label: "staff.photoUrl" },
        { value: "education.level", label: "education.level" },
      ],
    },
    {
      label: "Dokumen",
      items: Object.values(DOCUMENT_TYPES).flatMap((d) =>
        DOC_ROLES.filter((r) => r.value !== "expiryAlt" || d.hasExpiry).map((r) => ({
          value: `document.${d.code}.${r.value}`,
          label: `${d.code} → ${r.label}`,
        }))
      ),
    },
    {
      label: "Kompetensi",
      items: [
        ...COMPETENCIES.map((c) => ({ value: `competency.${c.code}`, label: c.name })),
        // KD/RN keep their internal codes as `value` but are presented with the
        // full name so the UI never shows an unexplained abbreviation.
        { value: "competency.KD", label: "Kardiologi Dasar" },
        { value: "competency.RN", label: "Resusitasi Neonatus" },
        { value: "competency.LAINNYA", label: "Kompetensi Lainnya" },
      ],
    },
  ];
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "active" | "expiring" | "expired" | "info" | "pending" | "draft" | "rejected" }> = {
  DRAFT: { label: "Draf", variant: "draft" },
  SCANNING: { label: "Memindai", variant: "pending" },
  SCANNED: { label: "Terpindai", variant: "info" },
  MAPPING_REVIEW: { label: "Pemetaan", variant: "pending" },
  VALIDATING: { label: "Validasi", variant: "pending" },
  READY: { label: "Siap", variant: "info" },
  IMPORTING: { label: "Mengimpor", variant: "expiring" },
  COMPLETED: { label: "Selesai", variant: "active" },
  FAILED: { label: "Gagal", variant: "expired" },
  RECONCILED: { label: "Terekonsiliasi", variant: "active" },
  PAUSED: { label: "Jeda", variant: "draft" },
};

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

// ─── Component ─────────────────────────────────

export function MigrationCenterClient() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [batch, setBatch] = React.useState<Batch | null>(null);
  const [history, setHistory] = React.useState<Batch[]>([]);
  const [mappings, setMappings] = React.useState<Mapping[]>([]);
  const [loading, setLoading] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    validate?: ValidateResult;
    dryRun?: DryRunResult;
    import?: ImportResult;
    recon?: Reconciliation;
  }>({});
  const [ack, setAck] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [assess, setAssess] = React.useState<AssessResult | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const loadHistory = React.useCallback(async () => {
    try {
      const d = await api<{ batches: Batch[] }>("/api/admin/migration/history");
      setHistory(d.batches);
      return d.batches;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat riwayat");
      return [];
    }
  }, []);

  const loadAssessment = React.useCallback(async (id: string) => {
    try {
      const d = await api<AssessResult>(`/api/admin/migration/${id}/assessment`);
      setAssess(d);
    } catch {
      setAssess(null);
    }
  }, []);

  const loadBatch = React.useCallback(async (id: string) => {
    try {
      const d = await api<{ batch: Batch; itemCounts: ItemCount }>(`/api/admin/migration/${id}`);
      setBatch(d.batch);
      setMappings(d.batch.fieldMappings ?? []);
      const step = stepForStatus(d.batch.status, d.batch);
      setStep(step);
      if (step === 3) loadAssessment(id);
      if (d.batch.status === "RECONCILED") {
        const r = await api<{ reconciliation: Reconciliation | null }>(
          `/api/admin/migration/${id}/reconciliation`
        );
        if (r.reconciliation) setResult((prev) => ({ ...prev, recon: r.reconciliation! }));
      }
      return d.batch;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat batch");
      return null;
    }
  }, [loadAssessment]);

  React.useEffect(() => {
    (async () => {
      const batches = await loadHistory();
      const active = batches.find((b) => b.status !== "DRAFT");
      if (active) await loadBatch(active.id);
    })();
  }, [loadHistory, loadBatch]);

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : "Terjadi kesalahan");
    setLoading(null);
  }

  // ── Step 0: Upload ──
  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const d = await api<{ batch: Batch }>("/api/admin/migration/upload", { method: "POST", body: form });
      setBatch(d.batch);
      setMappings(d.batch.fieldMappings ?? []);
      setResult({});
      setStep(1);
      await loadHistory();
    } catch (e) {
      fail(e);
    } finally {
      setUploading(false);
    }
  }

  // ── Step 1: Mapping ──
  function setTarget(sourceField: string, target: string) {
    setMappings((prev) =>
      prev.map((m) =>
        m.sourceField === sourceField ? { ...m, targetField: target, isIgnored: target === "" } : m
      )
    );
  }

  async function saveMappings(runValidate: boolean) {
    if (!batch) return;
    setLoading(runValidate ? "validate" : "save");
    setError(null);
    try {
      await api(`/api/admin/migration/${batch.id}/mapping`, {
        method: "PUT",
        body: JSON.stringify({
          mappings: mappings.map((m) => ({
            sourceField: m.sourceField,
            targetField: m.targetField,
            isIgnored: m.isIgnored || m.targetField === "",
          })),
        }),
      });
      if (runValidate) await runValidation();
      else setLoading(null);
    } catch (e) {
      fail(e);
    }
  }

  // ── Step 2: Validate ──
  async function runValidation() {
    if (!batch) return;
    setLoading("validate");
    setError(null);
    try {
      const d = await api<ValidateResult>(`/api/admin/migration/${batch.id}/validate`, {
        method: "POST",
      });
      setResult((prev) => ({ ...prev, validate: d }));
      await loadBatch(batch.id);
      setStep(2);
    } catch (e) {
      fail(e);
    }
  }

  // ── Step 3: Dry run ──
  async function runDryRun() {
    if (!batch) return;
    setLoading("dryrun");
    setError(null);
    try {
      const d = await api<DryRunResult>(`/api/admin/migration/${batch.id}/dry-run`, {
        method: "POST",
      });
      setResult((prev) => ({ ...prev, dryRun: d }));
      await loadBatch(batch.id);
      setStep(3);
      setAck(false);
    } catch (e) {
      fail(e);
    }
  }

  // ── Step 4: Import ──
  async function runImport() {
    if (!batch) return;
    setLoading("import");
    setError(null);
    try {
      const d = await api<ImportResult>(`/api/admin/migration/${batch.id}/import`, {
        method: "POST",
        body: JSON.stringify({ acknowledge: true, onlyNew: true }),
      });
      setResult((prev) => ({ ...prev, import: d }));
      await loadBatch(batch.id);
      setStep(4);
    } catch (e) {
      fail(e);
    }
  }

  async function runRetry() {
    if (!batch) return;
    setLoading("retry");
    setError(null);
    try {
      const d = await api<ImportResult>(`/api/admin/migration/${batch.id}/retry`, { method: "POST" });
      setResult((prev) => ({ ...prev, import: d }));
      await loadBatch(batch.id);
    } catch (e) {
      fail(e);
    }
  }

  // ── Step 5: Reconcile ──
  async function runReconcile() {
    if (!batch) return;
    setLoading("recon");
    setError(null);
    try {
      const d = await api<Reconciliation>(`/api/admin/migration/${batch.id}/reconciliation`, {
        method: "POST",
      });
      setResult((prev) => ({ ...prev, recon: d }));
      await loadBatch(batch.id);
      setStep(5);
    } catch (e) {
      fail(e);
    }
  }

  async function forceItem(itemId: string) {
    if (!batch) return;
    setLoading("force");
    setError(null);
    try {
      await api(`/api/admin/migration/items/${itemId}/force`, { method: "POST" });
      await loadBatch(batch.id);
      if (result.recon) await runReconcile();
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between overflow-x-auto gap-2">
          {STEPS.map((s, idx) => {
            const isCompleted = idx < step;
            const isCurrent = idx === step;
            return (
              <div key={s} className="flex items-center gap-2 shrink-0">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    isCompleted
                      ? "bg-green-600 text-white"
                      : isCurrent
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {isCompleted ? <CheckCircle2 size={12} /> : idx + 1}
                </div>
                <span
                  className={`text-xs whitespace-nowrap ${
                    isCurrent ? "font-semibold text-slate-900" : "text-slate-500"
                  }`}
                >
                  {s}
                </span>
                {idx < STEPS.length - 1 && <div className="h-[1px] w-6 bg-slate-200 hidden sm:block" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setError(null)}>
            Tutup
          </Button>
        </div>
      )}

      {/* Batch header */}
      {batch && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
          <FileSpreadsheet size={14} className="text-slate-400" />
          <span className="font-medium text-slate-700">{batch.sourceReference}</span>
          <Badge variant={STATUS_BADGE[batch.status]?.variant ?? "default"}>
            {STATUS_BADGE[batch.status]?.label ?? batch.status}
          </Badge>
          <span>{batch.sourceCount} baris sumber</span>
          <span>·</span>
          <span>{fmtDate(batch.createdAt)}</span>
          <span className="ml-auto">
            Total basis data: <strong className="text-slate-700">{history.length}</strong> batch
          </span>
        </div>
      )}

      {/* ── Step 0: Sumber Data ── */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sumber Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center bg-slate-50">
              <div className="mx-auto flex h-12 w-12 items-center justify-center bg-blue-50 rounded-full mb-3">
                <UploadCloud size={24} className="text-blue-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Unggah Spreadsheet XLSX</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                File <code>.xlsx</code> hasil ekspor Google Sheets (read-only). Proses pemindaian
                bersifat aman — tidak ada data Google yang diubah.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
              />
              <Button
                variant="primary"
                className="mt-4"
                loading={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Memindai File…" : "Pilih File XLSX"}
              </Button>
            </div>

            {history.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-2">Batch Sebelumnya</h4>
                <Table scroll>
                  <TableHeader>
                    <TableRow>
                      <Th>File</Th>
                      <Th>Status</Th>
                      <Th>Baris</Th>
                      <Th>Dibuat</Th>
                      <Th></Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.slice(0, 8).map((b) => (
                      <TableRow key={b.id}>
                        <Td className="text-xs font-medium text-slate-800">{b.sourceReference}</Td>
                        <Td>
                          <Badge variant={STATUS_BADGE[b.status]?.variant ?? "default"}>
                            {STATUS_BADGE[b.status]?.label ?? b.status}
                          </Badge>
                        </Td>
                        <Td className="text-xs text-slate-500">{b.sourceCount}</Td>
                        <Td className="text-xs text-slate-500">{fmtDate(b.createdAt)}</Td>
                        <Td>
                          <Button size="sm" variant="secondary" onClick={() => loadBatch(b.id)}>
                            Buka
                          </Button>
                        </Td>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Pemetaan Field ── */}
      {step === 1 && batch && (
        <Card>
          <CardHeader>
            <CardTitle>Pemetaan Field</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <p className="text-[10px] text-slate-500">Sheet Utama</p>
                <p className="text-sm font-bold text-slate-900">{batch.scanResult?.primarySheet ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Baris Terdeteksi</p>
                <p className="text-sm font-bold text-slate-900">{batch.scanResult?.totalRows ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Kolom Terpetakan</p>
                <p className="text-sm font-bold text-green-600">
                  {mappings.filter((m) => m.targetField && !m.isIgnored).length} / {mappings.length}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Sheet Lain</p>
                <p className="text-sm font-bold text-slate-900">
                  {(batch.scanResult?.sheets?.length ?? 1) - 1}
                </p>
              </div>
            </div>

            {batch.scanResult?.warnings && batch.scanResult.warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {batch.scanResult.warnings.map((w, i) => (
                  <p key={i}>• {w}</p>
                ))}
              </div>
            )}

            <Table scroll>
              <TableHeader>
                <TableRow>
                  <Th>Kolom Sumber</Th>
                  <Th>Target Field</Th>
                  <Th>Contoh Data</Th>
                  <Th>Keyakinan</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((m) => (
                  <TableRow key={m.sourceField}>
                    <Td className="font-mono text-xs text-slate-800">{m.sourceField}</Td>
                    <Td>
                      <Select
                        className="h-8 text-xs font-mono"
                        value={m.targetField}
                        onChange={(e) => setTarget(m.sourceField, e.target.value)}
                      >
                        <option value="">— Abaikan —</option>
                        {targetGroups().map((g) => (
                          <optgroup key={g.label} label={g.label}>
                            {g.items.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </Select>
                    </Td>
                    <Td className="text-xs text-slate-500 max-w-[220px] truncate">
                      {batch.scanResult?.samples?.[m.sourceField] || "—"}
                    </Td>
                    <Td>
                      <Badge
                        variant={
                          m.targetField && !m.isIgnored
                            ? (m.confidence ?? 0) >= 0.9
                              ? "active"
                              : "info"
                            : "draft"
                        }
                      >
                        {m.targetField && !m.isIgnored
                          ? `${Math.round((m.confidence ?? 0.5) * 100)}%`
                          : "Diabaikan"}
                      </Badge>
                    </Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setStep(0)}>
                Kembali
              </Button>
              <Button variant="secondary" size="sm" loading={loading === "save"} onClick={() => saveMappings(false)}>
                Simpan Pemetaan
              </Button>
              <Button variant="primary" size="sm" loading={loading === "validate"} onClick={() => saveMappings(true)}>
                Simpan &amp; Validasi <ArrowRight size={14} />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Validasi ── */}
      {step === 2 && batch && (
        <Card>
          <CardHeader>
            <CardTitle>Validasi Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
              {[
                { label: "Baris Sumber", value: batch.sourceCount, cls: "text-slate-900" },
                { label: "Siap Impor", value: batch.sourceCount - batch.failedCount - batch.duplicateCount, cls: "text-slate-900" },
                { label: "Baru (CREATE)", value: batch.createdCount, cls: "text-blue-600" },
                { label: "Perbarui", value: batch.updatedCount, cls: "text-slate-900" },
                { label: "Duplikat", value: batch.duplicateCount, cls: "text-amber-600" },
                { label: "Gagal", value: batch.failedCount, cls: "text-red-600" },
              ].map((k) => (
                <div key={k.label}>
                  <p className="text-[10px] text-slate-500">{k.label}</p>
                  <p className={`text-base font-bold ${k.cls}`}>{k.value}</p>
                </div>
              ))}
            </div>

            {batch.warningCount > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {batch.warningCount} baris memiliki peringatan (mis. NIP atau profesi kosong) tetapi
                tetap dapat diimpor.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setStep(1)}>
                Ubah Pemetaan
              </Button>
              <Button variant="primary" size="sm" loading={loading === "validate"} onClick={runValidation}>
                <RefreshCw size={14} /> Jalankan Ulang Validasi
              </Button>
              <Button variant="primary" size="sm" loading={loading === "dryrun"} onClick={runDryRun} disabled={batch.failedCount + batch.duplicateCount === batch.sourceCount}>
                Lanjut ke Dry Run <ArrowRight size={14} />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Dry Run ── */}
      {step === 3 && batch && (
        <Card>
          <CardHeader>
            <CardTitle>Dry Run (Simulasi)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <h4 className="text-sm font-semibold text-amber-900">Hasil Simulasi</h4>
              <p className="text-xs text-amber-700 mt-1">
                Perhitungan dampak ke basis data sebelum commit aktual. Tidak ada data yang ditulis.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                {[
                  { label: "Staf Dibuat", value: result.dryRun?.create ?? batch.createdCount },
                  { label: "Staf Diperbarui", value: result.dryRun?.update ?? batch.updatedCount },
                  { label: "Dilewati / Duplikat", value: result.dryRun?.skip ?? batch.skippedCount },
                  { label: "Gagal", value: result.dryRun?.failed ?? batch.failedCount },
                ].map((k) => (
                  <div key={k.label}>
                    <span className="text-[10px] text-slate-500 block">{k.label}</span>
                    <span className="text-lg font-bold text-slate-900">{k.value}</span>
                  </div>
                ))}
              </div>
              {result.dryRun?.note && (
                <p className="text-xs text-amber-700 mt-3">⚠ {result.dryRun.note}</p>
              )}
            </div>

            {/* ── Assesmen: sudah vs belum masuk ── */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-800">
                  Assesmen Data — Sudah Masuk vs Baru
                </h4>
                {!assess ? (
                  <span className="text-xs text-slate-400">memuat assesmen…</span>
                ) : (
                  <Badge variant={assess.actionableRows > 0 ? "expiring" : "active"}>
                    {assess.actionableRows > 0
                      ? `${assess.actionableRows} baris baru`
                      : "Tidak ada data baru"}
                  </Badge>
                )}
              </div>
              {assess && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Berkas/link sudah ada", value: assess.docsAlready, cls: "text-slate-900" },
                      { label: "Berkas/link baru", value: assess.docsNew, cls: "text-blue-600" },
                      { label: "Staf baru", value: assess.staffNew, cls: "text-blue-600" },
                      { label: "Staf sudah ada", value: assess.staffAlready, cls: "text-slate-900" },
                    ].map((k) => (
                      <div key={k.label} className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
                        <p className="text-[10px] text-slate-500">{k.label}</p>
                        <p className={`text-base font-bold ${k.cls}`}>{k.value}</p>
                      </div>
                    ))}
                  </div>
                  {assess.rows.length > 0 && (
                    <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
                      {assess.rows.map((r) => (
                        <div key={r.sourceId} className="flex items-center gap-2 px-3 py-1.5">
                          <span className="text-xs font-medium text-slate-700 flex-1 truncate">
                            {r.name}
                          </span>
                          {!r.staffExists && <Badge variant="default">Staf baru</Badge>}
                          <span className="text-[11px] text-blue-700 shrink-0">
                            {r.newDocCodes.join(", ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    Import hanya menarik baris yang belum masuk — data yang sudah ada di database
                    dilewati, tidak digandakan.
                  </p>
                </>
              )}
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Saya memahami bahwa import akan menulis data ke tabel <code>staff</code>,{" "}
                <code>documents</code>, dan <code>staff_competencies</code> — hanya baris yang
                belum masuk database yang ditarik, data yang sudah ada dilewati.
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setStep(2)}>
                Kembali
              </Button>
              <Button variant="secondary" size="sm" loading={loading === "dryrun"} onClick={runDryRun}>
                <RefreshCw size={14} /> Ulangi Dry Run
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!ack || (assess !== null && assess.actionableRows === 0)}
                loading={loading === "import"}
                onClick={runImport}
              >
                <Play size={14} />{" "}
                {assess
                  ? assess.actionableRows > 0
                    ? `Impor ${assess.actionableRows} Baris Baru`
                    : "Tidak Ada Data Baru"
                  : "Eksekusi Import Sekarang"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Import ── */}
      {step === 4 && batch && (
        <Card>
          <CardHeader>
            <CardTitle>{loading === "import" ? "Sedang Mengimpor…" : "Import"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading === "import" ? (
              <div className="py-8 text-center space-y-3">
                <RefreshCw size={28} className="animate-spin text-blue-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-900">
                  Mengimpor {batch.sourceCount} baris…
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Setiap baris dijalankan dalam transaksi terpisah agar aman diulang (idempotent).
                  Jangan tutup halaman ini.
                </p>
              </div>
            ) : result.import ? (
              <div className="rounded-lg border border-green-200 bg-green-50/60 p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {[
                    { label: "Dibuat", value: result.import.created },
                    { label: "Diperbarui", value: result.import.updated },
                    { label: "Dokumen Masuk", value: result.import.docsImported },
                    { label: "Dilewati", value: result.import.skipped },
                    { label: "Gagal", value: result.import.failed },
                  ].map((k) => (
                    <div key={k.label}>
                      <span className="text-[10px] text-slate-500 block">{k.label}</span>
                      <span className="text-lg font-bold text-slate-900">{k.value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  {result.import.failed > 0 && (
                    <Button variant="secondary" size="sm" loading={loading === "retry"} onClick={runRetry}>
                      Coba Ulang yang Gagal ({result.import.failed})
                    </Button>
                  )}
                  <Button variant="primary" size="sm" loading={loading === "recon"} onClick={runReconcile}>
                    Lanjut ke Rekonsiliasi <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            ) : ["COMPLETED", "RECONCILED", "FAILED"].includes(batch.status) ? (
              <div className="rounded-lg border border-green-200 bg-green-50/60 p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {[
                    { label: "Dibuat", value: batch.createdCount },
                    { label: "Diperbarui", value: batch.updatedCount },
                    { label: "Dilewati", value: batch.skippedCount },
                    { label: "Peringatan", value: batch.warningCount },
                    { label: "Gagal", value: batch.failedCount },
                  ].map((k) => (
                    <div key={k.label}>
                      <span className="text-[10px] text-slate-500 block">{k.label}</span>
                      <span className="text-lg font-bold text-slate-900">{k.value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  {batch.failedCount > 0 && (
                    <Button variant="secondary" size="sm" loading={loading === "retry"} onClick={runRetry}>
                      Coba Ulang yang Gagal ({batch.failedCount})
                    </Button>
                  )}
                  <Button variant="primary" size="sm" loading={loading === "recon"} onClick={runReconcile}>
                    Lanjut ke Rekonsiliasi <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-500">
                Import belum dijalankan. Kembali ke Dry Run untuk memulai.
                <div className="mt-3">
                  <Button variant="secondary" size="sm" onClick={() => setStep(3)}>
                    Kembali ke Dry Run
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 5: Rekonsiliasi ── */}
      {step === 5 && batch && (
        <Card>
          <CardHeader>
            <CardTitle>Rekonsiliasi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result.recon ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-xs text-slate-500">
                  Bandingkan jumlah baris sumber dengan data yang benar-benar tersimpan di
                  PostgreSQL.
                </p>
                <Button variant="primary" size="sm" loading={loading === "recon"} onClick={runReconcile}>
                  <RefreshCw size={14} /> Jalankan Rekonsiliasi
                </Button>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <Table scroll>
                    <TableHeader>
                      <TableRow>
                        <Th>Metrik</Th>
                        <Th>Sumber (XLSX)</Th>
                        <Th>Target (Database)</Th>
                        <Th>Selisih</Th>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        {
                          label: "Staf",
                          src: result.recon.sourceStaffCount,
                          tgt: result.recon.targetStaffCount,
                        },
                        {
                          label: "Staf terimpor (sukses)",
                          src: result.recon.successCount,
                          tgt: result.recon.createdCount + result.recon.updatedCount,
                        },
                        {
                          label: "Dokumen meta",
                          src: result.recon.sourceDocumentCount,
                          tgt: result.recon.documentsImported,
                        },
                      ].map((r) => {
                        const diff = r.src - r.tgt;
                        return (
                          <TableRow key={r.label}>
                            <Td className="text-xs font-medium text-slate-800">{r.label}</Td>
                            <Td className="text-xs">{r.src}</Td>
                            <Td className="text-xs">{r.tgt}</Td>
                            <Td>
                              <Badge variant={diff === 0 ? "active" : "expiring"}>
                                {diff === 0 ? "Sesuai" : `${diff > 0 ? "+" : ""}${diff}`}
                              </Badge>
                            </Td>
                          </TableRow>
                        );
                      })}
                      <TableRow>
                        <Td className="text-xs font-medium text-slate-800">Kandidat duplikat</Td>
                        <Td className="text-xs">{result.recon.duplicateCandidates}</Td>
                        <Td className="text-xs">—</Td>
                        <Td>
                          <Badge variant={result.recon.duplicateCandidates === 0 ? "active" : "expiring"}>
                            {result.recon.duplicateCandidates === 0 ? "Bersih" : "Perlu review"}
                          </Badge>
                        </Td>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {result.recon.recordsMissingDocs > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    {result.recon.recordsMissingDocs} staf terimpor belum memiliki dokumen terlampir
                    (kemungkinan hanya berisi tautan Drive yang menunggu sinkronisasi Fase 5).
                  </div>
                )}

                {result.recon.duplicateItems.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-700 mb-2">
                      Antrean Review Duplikat ({result.recon.duplicateItems.length})
                    </h4>
                    <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
                      {result.recon.duplicateItems.map((d) => (
                        <div key={d.id} className="flex items-center gap-3 px-3 py-2">
                          <span className="text-xs font-mono text-slate-500">{d.sourceId}</span>
                          <span className="text-xs text-slate-700 flex-1 truncate">{d.reason}</span>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={loading === "force"}
                            onClick={() => forceItem(d.id)}
                          >
                            Tetap Impor
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.recon.failedItems.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-700 mb-2">
                      Item Gagal ({result.recon.failedItems.length})
                    </h4>
                    <div className="max-h-48 overflow-y-auto border border-red-200 rounded-md divide-y divide-red-100 bg-red-50/40">
                      {result.recon.failedItems.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 px-3 py-2">
                          <span className="text-xs font-mono text-slate-500">{f.sourceId}</span>
                          <span className="text-xs text-red-700 flex-1 truncate">{f.errorMessage}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-end">
                      <Button variant="secondary" size="sm" loading={loading === "retry"} onClick={runRetry}>
                        Coba Ulang Semua yang Gagal
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="primary" size="sm" onClick={() => router.push("/komite/staff")}>
                    Lihat Data SDM Terimpor →
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
