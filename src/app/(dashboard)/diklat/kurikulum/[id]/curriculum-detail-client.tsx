"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileUp, Plus, Trash2, Download, Link2 } from "lucide-react";
import { CURRICULUM_STATUS_LABELS } from "@/lib/diklat/shared";

interface TrainingLite {
  id: string;
  title: string;
  status: string;
  startDate: string;
  jpl: number | null;
}
interface Item {
  id: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  targetJpl: number | null;
  status: string;
  trainings: TrainingLite[];
}
interface ProgramDetail {
  id: string;
  year: number;
  name: string;
  status: string;
  description: string | null;
  documentName: string | null;
  documentStorageKey: string | null;
}

const STATUSES = Object.keys(CURRICULUM_STATUS_LABELS);

export function CurriculumDetailClient({
  program,
  items,
  canManage,
  linkableTrainings,
}: {
  program: ProgramDetail;
  items: Item[];
  canManage: boolean;
  linkableTrainings: TrainingLite[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [item, setItem] = React.useState({ title: "", targetDate: "", targetJpl: "", status: "DIRANCANG" });

  async function call(url: string, init: RequestInit, key: string, okMsg: string) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fetch(url, init);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal memproses");
      setMsg({ type: "ok", text: okMsg });
      router.refresh();
      return true;
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal memproses" });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function uploadDoc() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg({ type: "err", text: "Pilih file dokumen terlebih dahulu." });
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    const ok = await call(`/api/diklat/curriculum/${program.id}/document`, { method: "POST", body: fd }, "doc", "Dokumen kurikulum diunggah.");
    if (ok && fileRef.current) fileRef.current.value = "";
  }

  async function addItem() {
    if (!item.title.trim()) return;
    const ok = await call(
      `/api/diklat/curriculum/${program.id}/items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title.trim(),
          targetDate: item.targetDate || null,
          targetJpl: item.targetJpl ? Number(item.targetJpl) : null,
          status: item.status,
        }),
      },
      "item",
      "Materi ditambahkan.",
    );
    if (ok) setItem({ title: "", targetDate: "", targetJpl: "", status: "DIRANCANG" });
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div role="status" className={`rounded-md border px-4 py-2.5 text-xs ${msg.type === "ok" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dokumen Kurikulum</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {program.documentStorageKey ? (
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-xs">
              <span className="truncate">{program.documentName ?? "kurikulum"}</span>
              <a href={`/api/diklat/curriculum/${program.id}/document`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                <Download size={12} /> Unduh
              </a>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Belum ada dokumen kurikulum.</p>
          )}
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp" className="text-xs" />
              <Button variant="secondary" size="sm" loading={busy === "doc"} onClick={uploadDoc}>
                <FileUp size={12} /> Unggah Dokumen
              </Button>
            </div>
          )}
          <p className="text-[11px] text-slate-400">
            Dokumen disimpan melalui penyimpanan aplikasi. Daftar materi di bawah diisi manual — tidak ada ekstraksi otomatis dari dokumen.
          </p>
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Tambah Materi / Rencana Kegiatan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-slate-500">Nama Materi *</span>
                <input
                  value={item.title}
                  onChange={(e) => setItem((f) => ({ ...f, title: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Target Tanggal</span>
                <input
                  type="date"
                  value={item.targetDate}
                  onChange={(e) => setItem((f) => ({ ...f, targetDate: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Target JPL</span>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={item.targetJpl}
                  onChange={(e) => setItem((f) => ({ ...f, targetJpl: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" size="sm" loading={busy === "item"} disabled={!item.title.trim()} onClick={addItem}>
                <Plus size={12} /> Tambah Materi
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Materi &amp; Realisasi ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table scroll>
            <TableHeader>
              <TableRow>
                <Th>Materi</Th>
                <Th>Target</Th>
                <Th className="text-right">Target JPL</Th>
                <Th>Status</Th>
                <Th>Kegiatan Realisasi</Th>
                <Th></Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <Td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                    Belum ada materi.
                  </Td>
                </TableRow>
              ) : (
                items.map((it) => (
                  <TableRow key={it.id}>
                    <Td className="text-xs font-medium">{it.title}</Td>
                    <Td className="text-xs text-slate-500">
                      {it.targetDate ? new Date(it.targetDate).toLocaleDateString("id-ID") : "—"}
                    </Td>
                    <Td className="text-right text-xs tabular-nums">{it.targetJpl ?? "—"}</Td>
                    <Td>
                      {canManage ? (
                        <select
                          value={it.status}
                          disabled={busy !== null}
                          onChange={(e) =>
                            call(
                              `/api/diklat/curriculum/items/${it.id}`,
                              { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: e.target.value }) },
                              "st" + it.id,
                              "Status materi diperbarui.",
                            )
                          }
                          className="h-7 rounded border border-slate-300 bg-white px-1.5 text-[11px]"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {CURRICULUM_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge variant={it.status === "SELESAI" ? "active" : "info"}>
                          {CURRICULUM_STATUS_LABELS[it.status] ?? it.status}
                        </Badge>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {it.trainings.length === 0 ? (
                        <span className="text-amber-600">Belum terlaksana</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {it.trainings.map((t) => (
                            <Link key={t.id} href={`/diklat/trainings/${t.id}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                              <Link2 size={11} /> {t.title}
                            </Link>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right">
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Hapus materi"
                          disabled={busy !== null}
                          onClick={() => {
                            if (!confirm(`Hapus materi "${it.title}"?`)) return;
                            call(`/api/diklat/curriculum/items/${it.id}`, { method: "DELETE" }, "del" + it.id, "Materi dihapus.");
                          }}
                        >
                          <Trash2 size={12} className="text-red-500" />
                        </Button>
                      )}
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManage && linkableTrainings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Hubungkan Kegiatan Realisasi ke Materi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              Pilih kegiatan pada tahun {program.year} dan materi kurikulum yang direalisasikannya. Menautkan tidak
              mengubah data kehadiran, nilai, atau sertifikat kegiatan.
            </p>
            <div className="space-y-2">
              {linkableTrainings.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs">
                  <Link href={`/diklat/trainings/${t.id}`} className="min-w-[200px] flex-1 font-medium text-blue-700 hover:underline">
                    {t.title}
                  </Link>
                  <span className="text-slate-500">{new Date(t.startDate).toLocaleDateString("id-ID")}</span>
                  <span className="tabular-nums text-slate-500">{t.jpl != null ? `${t.jpl} JPL` : "—"}</span>
                  {items.length > 0 ? (
                    <select
                      defaultValue=""
                      disabled={busy !== null}
                      onChange={(e) => {
                        const itemId = e.target.value;
                        if (!itemId) return;
                        call(
                          `/api/diklat/trainings/${t.id}`,
                          { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ curriculumItemId: itemId }) },
                          "link" + t.id,
                          "Kegiatan dihubungkan ke materi.",
                        );
                        e.target.value = "";
                      }}
                      className="h-7 rounded border border-slate-300 bg-white px-1.5 text-[11px]"
                    >
                      <option value="">— Hubungkan ke materi —</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.title}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-amber-600">Tambah materi terlebih dahulu</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
