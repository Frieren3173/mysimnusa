"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, FormField } from "@/components/ui/form";
import {
  Award,
  Download,
  FileDown,
  Loader2,
  Eye,
  CheckSquare,
  Square as SquareIcon,
} from "lucide-react";

/**
 * IHT / Diklat certificate generator panel.
 *
 * Fills the official PowerPoint template (`public/templates/sertifikat-iht.pptx`)
 * per participant. Input kegiatan + pilih peserta → preview → generate (.pptx per
 * peserta atau ZIP). Nomor sertifikat disusun dari pola yang bisa dikonfigurasi.
 */

interface ParticipantOpt {
  staffId: string;
  staff: { id: string; name: string; profession: string; nip: string | null };
}

interface DetailLite {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string | null;
  participants: ParticipantOpt[];
}

const KEPALA_SEKSI = {
  position: "KEPALA SEKSI KEPERAWATAN DAN KEBIDANAN",
  name: "Muhammad Rijali Pajri, S.Kep.Ners., M.M",
  nip: "198607212009121001",
};

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function fmtIndo(d: string): string {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
function romanMonth(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "I" : ROMAN[dt.getMonth()];
}
function buildNumber(pattern: string, prefix: string, seq: number, date: string): string {
  const dt = new Date(date);
  const year = Number.isNaN(dt.getTime()) ? String(new Date().getFullYear()) : String(dt.getFullYear());
  return pattern
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{SEQ(?::(\d+))?\}/g, (_m, n) => String(seq).padStart(n ? Number(n) : 3, "0"))
    .replace(/\{MONTH\}/g, romanMonth(date))
    .replace(/\{YEAR\}/g, year);
}

export function CertificateGenerator({
  detail,
  canIssue,
}: {
  detail: DetailLite;
  canIssue: boolean;
}) {
  const participants = detail.participants;

  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [tema, setTema] = React.useState(() => detail.title);
  const [tanggal, setTanggal] = React.useState(() => detail.startDate.slice(0, 10));
  const [tempat, setTempat] = React.useState(
    () => detail.location ?? "Rumah Sakit Adhyaksa Jawa Timur",
  );
  const [jpl, setJpl] = React.useState("4");
  const [kepalaDiklatNama, setKepalaDiklatNama] = React.useState("");
  const [kepalaDiklatNip, setKepalaDiklatNip] = React.useState("");
  const [prefix, setPrefix] = React.useState("RSAJT/IHT/IBS/");
  const [pattern, setPattern] = React.useState("{PREFIX}{SEQ:3}/{MONTH}/{YEAR}");
  const [busy, setBusy] = React.useState<null | "single" | "zip" | "template">(null);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allSelected = participants.length > 0 && selected.size === participants.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(participants.map((p) => p.staffId)));

  // Preview: first selected participant (or first participant).
  const previewP = participants.find((p) => p.staffId === previewId) ?? participants.find((p) => selected.has(p.staffId)) ?? participants[0];
  const previewSeq = Math.max(1, [...selected].indexOf(previewP?.staffId ?? "") + 1);
  const previewNo = buildNumber(pattern, prefix, previewSeq, tanggal);

  function validate(): string | null {
    if (selected.size === 0) return "Pilih minimal satu peserta.";
    if (!tema.trim()) return "Tema wajib diisi.";
    if (Number.isNaN(new Date(tanggal).getTime())) return "Tanggal tidak valid.";
    if (!tempat.trim()) return "Tempat wajib diisi.";
    const j = Number(jpl);
    if (!Number.isInteger(j) || j < 1) return "JPL harus angka ≥ 1.";
    return null;
  }

  async function generate(mode: "single" | "zip") {
    const v = validate();
    if (v) {
      setMsg({ type: "err", text: v });
      return;
    }
    setBusy(mode);
    setMsg(null);
    try {
      const res = await fetch(`/api/diklat/trainings/${detail.id}/certificates/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffIds: [...selected],
          mode,
          tema: tema.trim(),
          tanggal,
          tempat: tempat.trim(),
          jpl: Number(jpl),
          kepalaDiklatNama: kepalaDiklatNama.trim() || null,
          kepalaDiklatNip: kepalaDiklatNip.trim() || null,
          numberPattern: pattern,
          numberPrefix: prefix,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Gagal membuat sertifikat");
      }
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition") ?? "";
      const fname = /filename="([^"]+)"/.exec(dispo)?.[1] ?? (mode === "zip" ? "Sertifikat.zip" : "Sertifikat.pptx");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg({
        type: "ok",
        text:
          mode === "zip"
            ? `${selected.size} sertifikat dibuat — file ZIP diunduh.`
            : "Sertifikat dibuat — file .pptx diunduh.",
      });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal membuat sertifikat" });
    } finally {
      setBusy(null);
    }
  }

  async function downloadTemplate() {
    setBusy("template");
    setMsg(null);
    try {
      const res = await fetch("/api/diklat/certificate-template");
      if (!res.ok) throw new Error("Gagal mengunduh template");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Contoh_Template_Sertifikat_IHT.pptx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal mengunduh template" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div
          role="status"
          className={`rounded-md border px-4 py-2.5 text-xs ${
            msg.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Left: activity form ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award size={16} /> Data Kegiatan IHT
            </CardTitle>
            <CardDescription>Isi identitas kegiatan. Placeholder terisi otomatis ke template.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormField label="Nama Kegiatan" required>
              <Input value={detail.title} disabled />
            </FormField>
            <FormField label="Tema / Materi" required>
              <Input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="cth. Heacting & Perawatan Luka" />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Tanggal" required>
                <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
              </FormField>
              <FormField label="JPL" required>
                <Input type="number" min={1} max={999} value={jpl} onChange={(e) => setJpl(e.target.value)} />
              </FormField>
            </div>
            <FormField label="Tempat" required>
              <Input value={tempat} onChange={(e) => setTempat(e.target.value)} placeholder="cth. Ruang IBS" />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Kepala Bagian Diklat (nama)" hint="Kosongkan bila belum ditetapkan">
                <Input value={kepalaDiklatNama} onChange={(e) => setKepalaDiklatNama(e.target.value)} placeholder="…………………" />
              </FormField>
              <FormField label="NIP Kepala Bagian Diklat">
                <Input value={kepalaDiklatNip} onChange={(e) => setKepalaDiklatNip(e.target.value)} placeholder="…………………" />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Prefix Nomor" hint="cth. RSAJT/IHT/IBS/">
                <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
              </FormField>
              <FormField label="Pola Nomor" hint="Token: {PREFIX} {SEQ:3} {MONTH} {YEAR}">
                <Input value={pattern} onChange={(e) => setPattern(e.target.value)} />
              </FormField>
            </div>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              Contoh hasil: <span className="font-mono">{buildNumber(pattern, prefix, 1, tanggal)}</span>
            </p>
          </CardContent>
        </Card>

        {/* ── Right: participants + preview ── */}
        <Card>
          <CardHeader>
            <CardTitle>Peserta ({selected.size}/{participants.length} dipilih)</CardTitle>
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              {allSelected ? <CheckSquare size={13} /> : <SquareIcon size={13} />}
              {allSelected ? "Batal pilih semua" : "Pilih semua"}
            </button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-64 overflow-y-auto rounded-md border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {participants.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-[var(--color-muted-foreground)]">
                  Belum ada peserta. Tambahkan pada tab Peserta.
                </p>
              ) : (
                participants.map((p) => (
                  <label
                    key={p.staffId}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-[var(--color-primary-subtle)]/50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(p.staffId)}
                      onChange={() => toggle(p.staffId)}
                      className="h-4 w-4 rounded border-slate-300 accent-[var(--color-primary)]"
                    />
                    <span className="flex-1 truncate text-xs font-medium text-[var(--color-foreground)]">
                      {p.staff.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">
                      {p.staff.profession}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setPreviewId(p.staffId);
                      }}
                      className="shrink-0 rounded p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]"
                      title="Pratinjau"
                    >
                      <Eye size={13} />
                    </button>
                  </label>
                ))
              )}
            </div>

            {/* Preview */}
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]/40 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                <Eye size={12} /> Pratinjau Sertifikat
              </p>
              <div className="relative overflow-hidden rounded-md border border-[var(--color-border)] bg-white p-4 text-center">
                <p className="text-[9px] font-semibold tracking-widest text-[var(--color-primary)]">
                  RUMAH SAKIT ADHYAKSA JAWA TIMUR
                </p>
                <p className="mt-1 text-lg font-extrabold tracking-[0.2em] text-[var(--color-primary)]">SERTIFIKAT</p>
                <p className="text-[8px] tracking-[0.3em] text-[var(--color-muted-foreground)]">IHT RUANG IBS</p>
                <p className="mt-2 text-[10px] text-[var(--color-muted-foreground)]">Diberikan kepada</p>
                <p className="mx-auto mt-1 max-w-[80%] border-b border-[var(--color-border)] pb-0.5 text-sm font-bold text-[var(--color-foreground)]">
                  {previewP?.staff.name ?? "— pilih peserta —"}
                </p>
                <p className="mt-1.5 text-[10px] font-semibold text-[var(--color-primary)]">{tema || "—"}</p>
                <p className="mt-1 text-[9px] text-[var(--color-muted-foreground)]">
                  pada {tanggal ? fmtIndo(tanggal) : "—"} di {tempat || "—"} · {jpl} JPL
                </p>
                <p className="mt-1 text-[8px] text-[var(--color-muted-foreground)]">No: {previewNo}</p>
                <div className="mt-3 flex justify-between text-left text-[8px] text-[var(--color-muted-foreground)]">
                  <div>
                    <p className="font-semibold text-[var(--color-foreground)]">{KEPALA_SEKSI.position}</p>
                    <p className="mt-4 font-medium text-[var(--color-foreground)]">{KEPALA_SEKSI.name}</p>
                    <p>NIP. {KEPALA_SEKSI.nip}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--color-foreground)]">KEPALA BAGIAN DIKLAT</p>
                    <p className="mt-4 font-medium text-[var(--color-foreground)]">{kepalaDiklatNama || "……………………"}</p>
                    <p>NIP. {kepalaDiklatNip || "…………………"}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={!canIssue || busy !== null || selected.size === 0}
                loading={busy === "zip"}
                onClick={() => generate("zip")}
              >
                {busy === "zip" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Generate {selected.size > 0 ? `(${selected.size})` : ""} — ZIP
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canIssue || busy !== null || selected.size !== 1}
                loading={busy === "single"}
                onClick={() => generate("single")}
                title={selected.size !== 1 ? "Pilih tepat 1 peserta" : "Unduh .pptx satu peserta"}
              >
                <FileDown size={12} /> Unduh 1 (.pptx)
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                loading={busy === "template"}
                onClick={downloadTemplate}
              >
                <FileDown size={12} /> Unduh Contoh Template
              </Button>
            </div>
            {!canIssue && (
              <p className="text-[11px] text-[var(--color-danger)]">
                Anda tidak memiliki izin menerbitkan sertifikat.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
