"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Textarea, FormField } from "@/components/ui/form";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { BorangStatusBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BorangWorkflowTimeline } from "@/components/borang/workflow-timeline";
import { CheckCircle2, RotateCcw, Printer, Archive, Eye, ChevronDown } from "lucide-react";

export interface ReviewEntry {
  id: string;
  period: string;
  patientIdentifier: string;
  rmNumber: string | null;
  actionType: string;
  quantity: number;
  notes: string | null;
  status: string;
  rejectReason: string | null;
  submittedAt: string | null;
  createdAt: string;
  staff: { id: string; name: string; profession: string; nip?: string | null };
  room: { id?: string; name: string } | null;
  kepalaRuangName?: string | null;
  kepalaRuangNip?: string | null;
  verifications?: { action: string; notes: string | null; createdAt: string }[];
}

type Mode = "karu" | "secretariat" | "print";

interface ActionDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  tone: "primary" | "secondary" | "danger";
  needNote?: boolean;
  confirm?: string;
}

const MODE_ACTIONS: Record<Mode, { statuses: string[]; actions: ActionDef[]; title: string }> = {
  karu: {
    statuses: ["SUBMITTED"],
    title: "Antrean Review Kepala Ruang",
    actions: [
      { key: "APPROVE_KARU", label: "Setujui", icon: <CheckCircle2 size={12} />, tone: "primary" },
      {
        key: "REQUEST_REVISION",
        label: "Minta Revisi",
        icon: <RotateCcw size={12} />,
        tone: "danger",
        needNote: true,
        confirm: "Kembalikan borang ini ke pengaju untuk direvisi?",
      },
    ],
  },
  secretariat: {
    statuses: ["APPROVED_KARU"],
    title: "Antrean Sekretariat (DIKLAT_BORANG)",
    actions: [
      {
        key: "READY_TO_PRINT",
        label: "Finalisasi & Siap Cetak",
        icon: <CheckCircle2 size={12} />,
        tone: "primary",
        confirm: "Finalisasi dokumen ini dan tandai siap dicetak?",
      },
      {
        key: "ADMIN_REVISION",
        label: "Kembalikan untuk Revisi",
        icon: <RotateCcw size={12} />,
        tone: "danger",
        needNote: true,
        confirm: "Kembalikan borang ke pengaju untuk revisi administratif?",
      },
    ],
  },
  print: {
    statuses: ["READY_TO_PRINT", "PRINTED"],
    title: "Proses Cetak & Penyelesaian",
    actions: [
      {
        key: "PRINT",
        label: "Tandai Sudah Dicetak",
        icon: <Printer size={12} />,
        tone: "secondary",
        confirm: "Tandai dokumen ini sudah dicetak?",
      },
      {
        key: "COMPLETE",
        label: "Selesaikan",
        icon: <Archive size={12} />,
        tone: "primary",
        confirm: "Tandai dokumen ini selesai (ditandatangani, distempel, dikembalikan ke ruangan)?",
      },
    ],
  },
};

export function BorangReviewClient({
  mode,
  initialEntries,
  canPrintHref,
}: {
  mode: Mode;
  initialEntries: ReviewEntry[];
  /** Optional builder for the preview/print link (opens the DOCX export). */
  canPrintHref?: (e: ReviewEntry) => string | null;
}) {
  const cfg = MODE_ACTIONS[mode];
  const [entries, setEntries] = React.useState(initialEntries);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [noteTarget, setNoteTarget] = React.useState<{ entry: ReviewEntry; action: string } | null>(null);
  const [note, setNote] = React.useState("");
  const [confirmTarget, setConfirmTarget] = React.useState<{ entry: ReviewEntry; action: string } | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        cfg.statuses.map(async (status) => {
          const res = await fetch(`/api/borang/entries?status=${status}&perPage=100${mode === "karu" ? "&assigned=1" : ""}`);
          const json = await res.json();
          return json?.success ? (json.data.data as ReviewEntry[]) : [];
        }),
      );
      setEntries(results.flat());
    } finally {
      setLoading(false);
    }
  }, [cfg.statuses, mode]);

  React.useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function act(entry: ReviewEntry, action: string, notes?: string) {
    setBusy(entry.id + action);
    setMsg(null);
    try {
      const res = await fetch(`/api/borang/entries/${entry.id}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal memproses");
      setMsg({ type: "ok", text: "Berhasil diproses." });
      load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal memproses" });
    } finally {
      setBusy(null);
    }
  }

  function onAction(entry: ReviewEntry, def: ActionDef) {
    if (def.needNote) {
      setNote("");
      setNoteTarget({ entry, action: def.key });
      return;
    }
    if (def.confirm) {
      setConfirmTarget({ entry, action: def.key });
      return;
    }
    act(entry, def.key);
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div
          role="status"
          className={`rounded-md border px-4 py-2.5 text-xs ${
            msg.type === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {cfg.title} ({entries.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table scroll>
            <TableHeader>
              <TableRow>
                <Th>Periode</Th>
                <Th>Petugas</Th>
                <Th>Ruangan</Th>
                <Th>Pasien</Th>
                <Th>Tindakan</Th>
                <Th>Jumlah</Th>
                <Th>Status</Th>
                <Th></Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <Td colSpan={8} className="text-center text-xs text-slate-400 py-8">
                    Memuat…
                  </Td>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <Td colSpan={8} className="text-center text-xs text-slate-400 py-8">
                    Tidak ada borang di antrean ini.
                  </Td>
                </TableRow>
              ) : (
                entries.map((e) => {
                  const printHref = canPrintHref?.(e) ?? null;
                  const isOpen = expanded.has(e.id);
                  return (
                    <React.Fragment key={e.id}>
                    <TableRow>
                      <Td className="text-xs font-mono">{e.period}</Td>
                      <Td className="text-xs">
                        {e.staff.name}
                        <p className="text-[10px] text-slate-400">{e.staff.profession}</p>
                      </Td>
                      <Td className="text-xs">{e.room?.name ?? "—"}</Td>
                      <Td className="text-xs font-mono">
                        {e.patientIdentifier}
                        {e.rmNumber && <span className="block text-[10px] text-slate-400">RM {e.rmNumber}</span>}
                      </Td>
                      <Td className="text-xs">
                        {e.actionType}
                        {(e.status === "REVISION_REQUIRED" || e.rejectReason) && e.rejectReason && (
                          <p className="text-[10px] text-red-600 mt-0.5">Catatan: {e.rejectReason}</p>
                        )}
                      </Td>
                      <Td className="text-xs">{e.quantity}</Td>
                      <Td>
                        <BorangStatusBadge status={e.status} />
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Lihat timeline"
                          onClick={() => toggle(e.id)}
                          aria-expanded={isOpen}
                        >
                          <ChevronDown size={14} className={`text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </Button>
                        {printHref && (
                          <a
                            href={printHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mr-1 inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            title="Pratinjau dokumen untuk dicetak"
                          >
                            <Eye size={12} /> Pratinjau
                          </a>
                        )}
                        {cfg.actions.map((def) => {
                          // Only offer "Selesaikan" once PRINTED; "Tandai dicetak" once READY.
                          if (def.key === "COMPLETE" && e.status !== "PRINTED") return null;
                          if (def.key === "PRINT" && e.status !== "READY_TO_PRINT") return null;
                          return (
                            <Button
                              key={def.key}
                              variant={def.tone === "danger" ? "danger" : def.tone === "primary" ? "primary" : "secondary"}
                              size="sm"
                              className="ml-1"
                              disabled={busy !== null}
                              loading={busy === e.id + def.key}
                              onClick={() => onAction(e, def)}
                            >
                              {def.icon} {def.label}
                            </Button>
                          );
                        })}
                      </Td>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <Td colSpan={8} className="bg-[var(--color-surface-raised)]/40">
                          <div className="grid gap-6 py-2 sm:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs font-semibold text-[var(--color-foreground)]">Alur Workflow</p>
                              <BorangWorkflowTimeline status={e.status} />
                            </div>
                            <div className="space-y-1.5 text-xs">
                              <p className="font-semibold text-[var(--color-foreground)]">Identitas &amp; Review</p>
                              <p className="text-[var(--color-muted-foreground)]">
                                Pengaju: <span className="text-[var(--color-foreground)]">{e.staff.name}</span>
                                {e.staff.nip ? ` (NIP ${e.staff.nip})` : ""}
                              </p>
                              <p className="text-[var(--color-muted-foreground)]">
                                Ruangan: <span className="text-[var(--color-foreground)]">{e.room?.name ?? "—"}</span>
                              </p>
                              <p className="text-[var(--color-muted-foreground)]">
                                Kepala Ruang: <span className="text-[var(--color-foreground)]">{e.kepalaRuangName ?? "—"}</span>
                              </p>
                              <p className="text-[var(--color-muted-foreground)]">
                                Diajukan: <span className="text-[var(--color-foreground)]">{e.submittedAt ? new Date(e.submittedAt).toLocaleString("id-ID") : "—"}</span>
                              </p>
                              {e.notes && (
                                <p className="text-[var(--color-muted-foreground)]">
                                  Catatan pengaju: <span className="text-[var(--color-foreground)]">{e.notes}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        </Td>
                      </TableRow>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Note-required dialog (revision requests). */}
      <ConfirmDialog
        open={noteTarget !== null}
        title="Catatan revisi wajib diisi"
        description="Borang akan dikembalikan ke pengaju dengan catatan berikut."
        tone="danger"
        confirmLabel="Kirim permintaan revisi"
        busy={busy !== null}
        onCancel={() => !busy && setNoteTarget(null)}
        onConfirm={() => {
          if (!noteTarget) return;
          if (!note.trim()) {
            setMsg({ type: "err", text: "Catatan tidak boleh kosong." });
            return;
          }
          act(noteTarget.entry, noteTarget.action, note.trim());
          setNoteTarget(null);
        }}
      >
        <FormField label="Catatan / alasan revisi" required>
          <Textarea
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            rows={3}
            maxLength={1000}
            className="min-h-[80px]"
            placeholder="Jelaskan bagian yang perlu diperbaiki…"
          />
        </FormField>
      </ConfirmDialog>

      {/* Plain confirmation dialog (approve / print / complete). */}
      <ConfirmDialog
        open={confirmTarget !== null}
        title={
          MODE_ACTIONS[mode].actions.find((a) => a.key === confirmTarget?.action)?.confirm ??
          "Konfirmasi tindakan"
        }
        tone="primary"
        confirmLabel="Ya, lanjutkan"
        busy={busy !== null}
        onCancel={() => !busy && setConfirmTarget(null)}
        onConfirm={() => {
          if (!confirmTarget) return;
          act(confirmTarget.entry, confirmTarget.action, note.trim() || undefined);
          setConfirmTarget(null);
        }}
      />
    </div>
  );
}

/** Small helper to render a status filter (kept for optional use by pages). */
export function ReviewStatusFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-52">
      <option value="">Semua</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
