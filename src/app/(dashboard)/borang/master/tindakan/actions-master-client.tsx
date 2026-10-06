"use client";

import * as React from "react";
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
import { Pencil } from "lucide-react";
import { NURSING_ACTION_CATEGORIES } from "@/lib/master-data";

interface ActionRow {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  isActive: boolean;
}

const EMPTY_FORM = { code: "", name: "", category: "", description: "" };

export function ActionsMasterClient() {
  const [rows, setRows] = React.useState<ActionRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(20);
  const [filters, setFilters] = React.useState({ q: "", status: "", category: "" });
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [editId, setEditId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), perPage: String(perPage) });
      if (filters.q) q.set("q", filters.q);
      if (filters.status) q.set("status", filters.status);
      if (filters.category) q.set("category", filters.category);
      const res = await fetch(`/api/borang/actions?${q}`);
      const json = await res.json();
      if (json?.success) {
        setRows(json.data.data);
        setTotal(json.data.pagination.total);
        setTotalPages(json.data.pagination.totalPages);
      } else {
        setMsg({ type: "err", text: json?.error?.message ?? "Gagal memuat tindakan" });
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
        code: form.code.trim(),
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || null,
      };
      const res = await fetch(
        editId ? `/api/borang/actions/${editId}` : "/api/borang/actions",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal menyimpan");
      setMsg({ type: "ok", text: editId ? "Tindakan diperbarui." : "Tindakan ditambahkan." });
      setForm(EMPTY_FORM);
      setEditId(null);
      load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menyimpan" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(a: ActionRow) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/borang/actions/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !a.isActive }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal mengubah status");
      setMsg({
        type: "ok",
        text: a.isActive
          ? `"${a.name}" dinonaktifkan — tidak muncul di pilihan Logbook baru.`
          : `"${a.name}" diaktifkan.`,
      });
      load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal mengubah status" });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(a: ActionRow) {
    setEditId(a.id);
    setForm({
      code: a.code,
      name: a.name,
      category: a.category,
      description: a.description ?? "",
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
          <CardTitle>{editId ? "Ubah Tindakan" : "Tambah Tindakan"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField label="Kode Tindakan" required hint="Unik">
              <Input
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="cth. TA-001"
                disabled={busy}
              />
            </FormField>
            <FormField label="Nama Tindakan" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="cth. Pemasangan Infus"
                disabled={busy}
              />
            </FormField>
            <FormField label="Kategori" required>
              <Select
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                disabled={busy}
              >
                <option value="">— Pilih kategori —</option>
                {NURSING_ACTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Deskripsi">
              <Input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Opsional"
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
              {editId ? "Simpan Perubahan" : "Tambah Tindakan"}
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
            placeholder="Kode / nama tindakan"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
          <Select
            className="w-48"
            value={filters.category}
            onChange={(e) => {
              setPage(1);
              setFilters((p) => ({ ...p, category: e.target.value }));
            }}
          >
            <option value="">Semua</option>
            {NURSING_ACTION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tindakan ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table scroll>
            <TableHeader>
              <TableRow>
                <Th>Kode</Th>
                <Th>Nama Tindakan</Th>
                <Th>Kategori</Th>
                <Th>Status</Th>
                <Th className="text-right">Aksi</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <Td colSpan={5} className="text-center text-xs text-slate-400 py-8">
                    Memuat…
                  </Td>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <Td colSpan={5} className="text-center text-xs text-slate-400 py-8">
                    Tidak ada tindakan.
                  </Td>
                </TableRow>
              ) : (
                rows.map((a) => (
                  <TableRow key={a.id}>
                    <Td className="text-xs font-mono">{a.code}</Td>
                    <Td className="text-xs font-medium text-slate-900">{a.name}</Td>
                    <Td className="text-xs">{a.category}</Td>
                    <Td>
                      <Badge variant={a.isActive ? "active" : "draft"}>
                        {a.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Ubah"
                        onClick={() => startEdit(a)}
                        disabled={busy}
                      >
                        <Pencil size={13} className="text-slate-500" />
                      </Button>{" "}
                      <Button
                        variant={a.isActive ? "secondary" : "primary"}
                        size="sm"
                        onClick={() => toggleStatus(a)}
                        disabled={busy}
                      >
                        {a.isActive ? "Nonaktifkan" : "Aktifkan"}
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
