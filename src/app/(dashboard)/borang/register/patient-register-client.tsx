"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, FormField, Input } from "@/components/ui/form";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Users, Upload, Download, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface RoomOption {
  id: string;
  name: string;
}

interface RegisterRow {
  id: string;
  no: number | null;
  patientName: string;
  rmNumber: string;
  diagnosis: string | null;
  createdAt: string;
}

/** Template download endpoint (kept as a variable so it is a plain anchor). */
const TEMPLATE_HREF = "/api/borang/patient-register/template";

/**
 * Patient register management UI (Kepala Ruang / Superadmin).
 * Authorization is enforced server-side; this component only shapes the UI for
 * the rooms the actor may manage.
 */
export function PatientRegisterClient({ rooms }: { rooms: RoomOption[] }) {
  const [roomId, setRoomId] = React.useState(rooms[0]?.id ?? "");
  const [rows, setRows] = React.useState<RegisterRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string; details?: string[] } | null>(null);
  const [search, setSearch] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const load = React.useCallback(async () => {
    if (!roomId) { setRows([]); return; }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/borang/patient-register?roomId=${encodeURIComponent(roomId)}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setRows(json.data.entries);
      } else {
        setRows([]);
        setMsg({ type: "err", text: json?.error?.message ?? "Gagal memuat register" });
      }
    } catch {
      setMsg({ type: "err", text: "Gagal memuat register" });
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  React.useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function upload(file: File) {
    if (!roomId) { setMsg({ type: "err", text: "Pilih ruangan terlebih dahulu" }); return; }
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("roomId", roomId);
      fd.set("file", file);
      const res = await fetch("/api/borang/patient-register", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        const d = json.data as { created: number; updated: number; total: number };
        setMsg({ type: "ok", text: `Import berhasil: ${d.created} baru, ${d.updated} diperbarui (total ${d.total}).` });
        await load();
      } else {
        setMsg({
          type: "err",
          text: json?.error?.message ?? "Import gagal",
          details: Array.isArray(json?.error?.fields?.rows) ? json.error.fields.rows : undefined,
        });
      }
    } catch {
      setMsg({ type: "err", text: "Import gagal. Coba lagi." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.patientName.toLowerCase().includes(q) || r.rmNumber.toLowerCase().includes(q));
  }, [rows, search]);

  if (rooms.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            title="Tidak ada ruangan yang Anda kelola"
            description="Anda belum ditugaskan sebagai Kepala Ruang untuk ruangan mana pun. Hubungi Superadmin untuk penugasan."
            icon={<Users size={28} />}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload size={16} /> Unggah Register</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Ruangan" required hint="Anda hanya dapat mengelola ruangan yang ditugaskan kepada Anda.">
              <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} disabled={uploading}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Berkas Register (.xlsx / .xls / .csv)" required hint="Header wajib: No. | Nama Pasien | Nomor RM | Diagnosis.">
              <Input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
              />
            </FormField>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a href={TEMPLATE_HREF}>
              <Button variant="secondary" size="sm" type="button">
                <Download size={14} /> Unduh Template
              </Button>
            </a>
            {uploading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 size={13} className="animate-spin" /> Mengunggah…
              </span>
            )}
          </div>

          {msg && (
            <div
              role="status"
              className={`rounded-md border px-3 py-2 text-xs ${msg.type === "ok" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}
            >
              <p className="flex items-center gap-1.5">
                {msg.type === "ok" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />} {msg.text}
              </p>
              {msg.details && msg.details.length > 0 && (
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  {msg.details.slice(0, 20).map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Import bersifat menambah/memperbarui berdasarkan Nomor RM. Baris lain yang tidak ada di berkas tetap dipertahankan.
            Jika ada satu baris tidak valid, seluruh berkas ditolak (tidak ada impor sebagian).
          </p>
        </CardContent>
      </Card>

      {/* Stored register */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><Users size={16} /> Register Tersimpan {rows.length > 0 && <span className="text-xs font-normal text-slate-400">({rows.length})</span>}</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama / No. RM…"
              className="h-8 w-56 rounded-md border border-[var(--color-border)] bg-white px-3 text-xs"
              aria-label="Cari pasien"
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Memuat…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={rows.length === 0 ? "Register masih kosong" : "Tidak ada hasil"}
                description={rows.length === 0 ? "Unggah berkas register untuk ruangan ini." : "Coba kata kunci lain."}
                icon={<Users size={24} />}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Th className="w-12">No</Th>
                  <Th>Nama Pasien</Th>
                  <Th>Nomor RM</Th>
                  <Th>Diagnosis</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <Td className="text-xs tabular-nums text-slate-500">{r.no ?? "—"}</Td>
                    <Td className="text-xs font-medium">{r.patientName}</Td>
                    <Td className="text-xs font-mono">{r.rmNumber}</Td>
                    <Td className="text-xs">{r.diagnosis ?? "—"}</Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
