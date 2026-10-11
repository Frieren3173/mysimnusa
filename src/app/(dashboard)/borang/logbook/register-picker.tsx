"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Select, FormField } from "@/components/ui/form";
import { Loader2, Users } from "lucide-react";

interface RegisterRow {
  id: string;
  no: number | null;
  patientName: string;
  rmNumber: string;
  diagnosis: string | null;
}

/**
 * Patient picker for the Borang (Logbook) form — Staff side.
 *
 * The Borang entry keeps its ANONYMOUS patient identifier (unchanged). This
 * picker lets Staff attribute the entry to a patient from their room's register
 * by appending a NON-IDENTIFYING reference (the RM number) to the entry notes.
 * The patient NAME is never copied into the Borang entry.
 *
 * The room is fixed by the parent form (the Staff's own room); the fetch is
 * scoped server-side, so a request for another room would be rejected there.
 */
export function RegisterPicker({
  roomId,
  onPick,
  disabled,
}: {
  roomId: string;
  onPick: (reference: string) => void;
  disabled?: boolean;
}) {
  const [rows, setRows] = React.useState<RegisterRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!roomId) { setRows([]); return; }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/borang/patient-register?roomId=${encodeURIComponent(roomId)}`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.success) setRows(json.data.entries);
        else { setRows([]); setError(json?.error?.message ?? "Gagal memuat register ruangan ini."); }
      } catch {
        if (!cancelled) { setRows([]); setError("Gagal memuat register ruangan ini."); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [roomId]);

  if (!roomId) return null;

  return (
    <FormField
      label="Pilih dari Register Ruangan (opsional)"
      hint={
        loading
          ? "Memuat register…"
          : error
            ? error
            : rows.length === 0
              ? "Register ruangan ini masih kosong. Hubungi Kepala Ruang untuk mengunggah daftar pasien."
              : "Menambahkan rujukan No. RM ke catatan. Nama pasien tidak disimpan pada Borang (tetap anonim)."
      }
      className="sm:col-span-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={disabled || loading || rows.length === 0}
          className="max-w-md"
        >
          <option value="">{rows.length === 0 ? "— Register kosong —" : "— Pilih pasien (No. RM) —"}</option>
          {rows.map((r) => (
            <option key={r.id} value={r.rmNumber}>
              {r.rmNumber}{r.diagnosis ? ` — ${r.diagnosis}` : ""}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || !selected}
          onClick={async () => {
            if (!selected) return;
            // Server-side re-validation: the RM must exist in THIS room's register.
            try {
              const res = await fetch(
                `/api/borang/patient-register?roomId=${encodeURIComponent(roomId)}&rm=${encodeURIComponent(selected)}`,
              );
              const json = await res.json().catch(() => null);
              if (res.ok && json?.success) {
                onPick(`RM: ${selected}`);
                setSelected("");
                setError(null);
              } else {
                setError(json?.error?.message ?? "RM tidak valid untuk ruangan ini.");
              }
            } catch {
              setError("Gagal memverifikasi RM. Coba lagi.");
            }
          }}
        >
          <Users size={14} /> Sisipkan RM ke catatan
        </Button>
        {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </div>
    </FormField>
  );
}
