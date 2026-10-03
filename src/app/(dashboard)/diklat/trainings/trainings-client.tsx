"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { TrainingStatusBadge } from "@/components/ui/badge";
import { Pencil, Plus, Trash2, ExternalLink } from "lucide-react";

interface TrainingRow {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  startDate: string;
  endDate: string;
  location: string | null;
  capacity: number | null;
  status: string;
  participantCount: number;
  certificateCount: number;
}

interface FormState {
  id?: string;
  title: string;
  category: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string;
  capacity: string;
  status: string;
}

const EMPTY: FormState = {
  title: "",
  category: "",
  description: "",
  startDate: "",
  endDate: "",
  location: "",
  capacity: "",
  status: "DRAFT",
};

const iso = (d: string) => d.slice(0, 10);

export function TrainingsClient({
  trainings,
  canCreate,
  canUpdate,
  canDelete,
}: {
  trainings: TrainingRow[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  function openCreate() {
    setForm({ ...EMPTY, startDate: iso(new Date().toISOString()), endDate: iso(new Date().toISOString()) });
    setMsg(null);
  }
  function openEdit(t: TrainingRow) {
    setForm({
      id: t.id,
      title: t.title,
      category: t.category ?? "",
      description: t.description ?? "",
      startDate: iso(t.startDate),
      endDate: iso(t.endDate),
      location: t.location ?? "",
      capacity: t.capacity != null ? String(t.capacity) : "",
      status: t.status,
    });
    setMsg(null);
  }

  async function submit() {
    if (!form) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        title: form.title,
        category: form.category || null,
        description: form.description || null,
        startDate: form.startDate,
        endDate: form.endDate,
        location: form.location || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        status: form.status,
      };
      const res = await fetch(form.id ? `/api/diklat/trainings/${form.id}` : "/api/diklat/trainings", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        const fields = json?.error?.fields
          ? Object.values(json.error.fields as Record<string, string[]>).flat().join("; ")
          : "";
        throw new Error((json?.error?.message ?? "Gagal menyimpan") + (fields ? ` — ${fields}` : ""));
      }
      setMsg({ type: "ok", text: form.id ? "Pelatihan diperbarui." : "Pelatihan dibuat." });
      setForm(null);
      router.refresh();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menyimpan" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: TrainingRow) {
    if (!confirm(`Hapus pelatihan "${t.title}"?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/diklat/trainings/${t.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal menghapus");
      setMsg({ type: "ok", text: "Pelatihan dihapus." });
      router.refresh();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menghapus" });
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof FormState, label: string, type = "text", extra?: Record<string, string>) => (
    <label className="space-y-1">
      <span className="text-xs text-slate-500">{label}</span>
      <input
        type={type}
        value={form ? String(form[key] ?? "") : ""}
        onChange={(e) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f))}
        className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
        {...extra}
      />
    </label>
  );

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

      <div className="flex justify-end">
        {canCreate && !form && (
          <Button variant="primary" size="sm" onClick={openCreate}>
            <Plus size={12} /> Pelatihan Baru
          </Button>
        )}
      </div>

      {form && (
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Ubah Pelatihan" : "Pelatihan Baru"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {field("title", "Judul *")}
              {field("category", "Kategori")}
              {field("startDate", "Mulai *", "date")}
              {field("endDate", "Selesai *", "date")}
              {field("location", "Lokasi")}
              {field("capacity", "Kuota", "number", { min: "1" })}
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Status</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => (f ? { ...f, status: e.target.value } : f))}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs"
                >
                  {["DRAFT", "PUBLISHED", "ONGOING", "COMPLETED", "CANCELLED"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">Deskripsi</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => (f ? { ...f, description: e.target.value } : f))}
                rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
              />
            </label>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setForm(null)} disabled={busy}>
                Batal
              </Button>
              <Button variant="primary" size="sm" loading={busy} onClick={submit}>
                Simpan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{trainings.length} Pelatihan</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Judul</Th>
                <Th>Kategori</Th>
                <Th>Tanggal</Th>
                <Th>Lokasi</Th>
                <Th>Status</Th>
                <Th>Peserta</Th>
                <Th>Sertifikat</Th>
                <Th></Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trainings.length === 0 ? (
                <TableRow>
                  <Td colSpan={8} className="text-center text-xs text-slate-400 py-8">
                    Belum ada pelatihan.
                  </Td>
                </TableRow>
              ) : (
                trainings.map((t) => (
                  <TableRow key={t.id}>
                    <Td>
                      <Link href={`/diklat/trainings/${t.id}`} className="text-xs font-medium text-blue-700 hover:underline">
                        {t.title}
                      </Link>
                    </Td>
                    <Td className="text-xs">{t.category ?? "—"}</Td>
                    <Td className="text-xs text-slate-500 whitespace-nowrap">
                      {iso(t.startDate)} → {iso(t.endDate)}
                    </Td>
                    <Td className="text-xs">{t.location ?? "—"}</Td>
                    <Td>
                      <TrainingStatusBadge status={t.status} />
                    </Td>
                    <Td className="text-xs">{t.participantCount}</Td>
                    <Td className="text-xs">{t.certificateCount}</Td>
                    <Td className="text-right whitespace-nowrap">
                      <Link href={`/diklat/trainings/${t.id}`}>
                        <Button variant="ghost" size="icon-sm" title="Kelola">
                          <ExternalLink size={12} />
                        </Button>
                      </Link>{" "}
                      {canUpdate && (
                        <Button variant="ghost" size="icon-sm" title="Ubah" onClick={() => openEdit(t)}>
                          <Pencil size={12} />
                        </Button>
                      )}{" "}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Hapus"
                          disabled={busy}
                          onClick={() => remove(t)}
                        >
                          <Trash2 size={12} />
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
    </div>
  );
}
