"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, FormField } from "@/components/ui/form";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  Th,
  Td,
  Pagination,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, ListChecks } from "lucide-react";
import { ROOM_TYPES } from "@/lib/master-data";

interface RoomRow {
  id: string;
  name: string;
  code: string | null;
  type: string | null;
  description: string | null;
  isActive: boolean;
  _count: { nursingActions: number; borangEntries: number };
}

const EMPTY_FORM = { name: "", code: "", type: "", description: "" };

export function RoomsMasterClient() {
  const [rows, setRows] = React.useState<RoomRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(20);
  const [filters, setFilters] = React.useState({ q: "", status: "", type: "" });
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [editId, setEditId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), perPage: String(perPage) });
      if (filters.q) q.set("q", filters.q);
      if (filters.status) q.set("status", filters.status);
      if (filters.type) q.set("type", filters.type);
      const res = await fetch(`/api/admin/rooms?${q}`);
      const json = await res.json();
      if (json?.success) {
        setRows(json.data.data);
        setTotal(json.data.pagination.total);
        setTotalPages(json.data.pagination.totalPages);
      } else {
        setMsg({ type: "err", text: json?.error?.message ?? "Gagal memuat ruangan" });
      }
    } finally {
      setLoading(false);
    }
  }, [page, perPage, filters]);

  React.useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        type: form.type || undefined,
        description: form.description.trim() || null,
      };
      const res = await fetch(editId ? `/api/admin/rooms/${editId}` : "/api/admin/rooms", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal menyimpan");
      setMsg({ type: "ok", text: editId ? "Ruangan diperbarui." : "Ruangan ditambahkan." });
      setForm(EMPTY_FORM);
      setEditId(null);
      load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menyimpan" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(r: RoomRow) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/rooms/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal mengubah status");
      setMsg({
        type: "ok",
        text: r.isActive
          ? `"${r.name}" dinonaktifkan — tidak muncul di pilihan Logbook.`
          : `"${r.name}" diaktifkan.`,
      });
      load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal mengubah status" });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(r: RoomRow) {
    setEditId(r.id);
    setForm({
      name: r.name,
      code: r.code ?? "",
      type: r.type ?? "",
      description: r.description ?? "",
    });
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
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
          <CardTitle>{editId ? "Ubah Ruangan" : "Tambah Ruangan"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField label="Nama Ruangan" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="cth. Instalasi Gawat Darurat"
                disabled={busy}
              />
            </FormField>
            <FormField label="Kode Ruangan" hint="Unik — kosongkan untuk otomatis">
              <Input
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="cth. IGD"
                disabled={busy}
              />
            </FormField>
            <FormField label="Jenis Ruangan" required>
              <Select
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                disabled={busy}
              >
                <option value="">— Pilih jenis —</option>
                {ROOM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Deskripsi">
              <Input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="cth. Pelayanan gawat darurat 24 jam"
                disabled={busy}
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            {editId && (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => {
                  setEditId(null);
                  setForm(EMPTY_FORM);
                }}
              >
                Batal Edit
              </Button>
            )}
            <Button variant="primary" size="sm" loading={busy} onClick={submit} type="button">
              {editId ? "Simpan Perubahan" : "Tambah Ruangan"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-700 mb-1">Cari</label>
          <Input
            value={filters.q}
            onChange={(e) => {
              setPage(1);
              setFilters((p) => ({ ...p, q: e.target.value }));
            }}
            placeholder="Nama / kode / deskripsi"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
          <Select
            className="w-36"
            value={filters.status}
            onChange={(e) => {
              setPage(1);
              setFilters((p) => ({ ...p, status: e.target.value }));
            }}
          >
            <option value="">Semua</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Jenis</label>
          <Select
            className="w-40"
            value={filters.type}
            onChange={(e) => {
              setPage(1);
              setFilters((p) => ({ ...p, type: e.target.value }));
            }}
          >
            <option value="">Semua</option>
            {ROOM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ruangan ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Kode</Th>
                <Th>Nama</Th>
                <Th>Jenis</Th>
                <Th>Tindakan</Th>
                <Th>Status</Th>
                <Th className="text-right">Aksi</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <Td colSpan={6} className="text-center text-xs text-slate-400 py-8">
                    Memuat…
                  </Td>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <Td colSpan={6} className="text-center text-xs text-slate-400 py-8">
                    Tidak ada ruangan.
                  </Td>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <Td className="text-xs font-mono">{r.code ?? "—"}</Td>
                    <Td className="text-xs font-medium text-slate-900">{r.name}</Td>
                    <Td className="text-xs">{r.type ?? "—"}</Td>
                    <Td className="text-xs">{r._count.nursingActions}</Td>
                    <Td>
                      <Badge variant={r.isActive ? "active" : "draft"}>
                        {r.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <Link
                        href={`/borang/master/ruangan/${r.id}`}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        title="Atur tindakan keperawatan ruangan ini"
                      >
                        <ListChecks size={12} /> Tindakan
                      </Link>{" "}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Ubah"
                        onClick={() => startEdit(r)}
                        disabled={busy}
                      >
                        <Pencil size={13} className="text-slate-500" />
                      </Button>{" "}
                      <Button
                        variant={r.isActive ? "secondary" : "primary"}
                        size="sm"
                        onClick={() => toggleStatus(r)}
                        disabled={busy}
                      >
                        {r.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            totalPages={Math.max(1, totalPages)}
            perPage={perPage}
            total={total}
            onPageChange={setPage}
            onPerPageChange={(v) => {
              setPage(1);
              setPerPage(v);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
