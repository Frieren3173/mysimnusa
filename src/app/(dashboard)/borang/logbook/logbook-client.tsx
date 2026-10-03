"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, FormField } from "@/components/ui/form";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { BorangStatusBadge } from "@/components/ui/badge";
import { Pencil, Send } from "lucide-react";

interface Entry {
  id: string;
  period: string;
  patientIdentifier: string;
  actionType: string;
  quantity: number;
  notes: string | null;
  status: string;
  rejectReason: string | null;
  createdAt: string;
  staff: { id: string; name: string; profession: string };
  room: { name: string } | null;
}

const ACTIONS = [
  "Asuhan keperawatan",
  "Pemasangan infus",
  "Pemasangan kateter",
  "Perawatan luka",
  "Pemberian obat",
  "Rekam tanda vital",
  "Kontrol pasca operasi",
  "Administrasi oksigen",
  "Suction",
  "Balikan posisi",
];

const EMPTY_FORM = {
  staffId: "",
  roomId: "",
  period: "",
  patientIdentifier: "",
  actionType: "",
  quantity: "1",
  notes: "",
};

export function LogbookClient({
  rooms,
  staffList,
  myStaffId,
  defaultStatus,
  canCreate,
  canUpdate,
  canSubmit,
}: {
  rooms: { id: string; name: string }[];
  staffList: { id: string; name: string; profession: string }[];
  myStaffId: string | null;
  defaultStatus: string;
  canCreate: boolean;
  canUpdate: boolean;
  canSubmit: boolean;
}) {
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [filters, setFilters] = React.useState({ status: defaultStatus, period: "", search: "" });
  const [form, setForm] = React.useState({
    ...EMPTY_FORM,
    staffId: myStaffId ?? "",
    period: new Date().toISOString().slice(0, 7),
  });
  const [editId, setEditId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ perPage: "50" });
      if (filters.status) q.set("status", filters.status);
      if (filters.period) q.set("period", filters.period);
      if (filters.search) q.set("search", filters.search);
      const res = await fetch(`/api/borang/entries?${q}`);
      const json = await res.json();
      if (json?.success) {
        setEntries(json.data.data);
        setTotal(json.data.pagination.total);
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  React.useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function submitForm() {
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        staffId: form.staffId || undefined,
        roomId: form.roomId || null,
        period: form.period,
        patientIdentifier: form.patientIdentifier,
        actionType: form.actionType,
        quantity: Number(form.quantity) || 1,
        notes: form.notes || undefined,
      };
      const res = await fetch(editId ? `/api/borang/entries/${editId}` : "/api/borang/entries", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal menyimpan");
      setMsg({ type: "ok", text: editId ? "Entri diperbarui." : "Entri tersimpan sebagai draf." });
      setForm({ ...EMPTY_FORM, staffId: myStaffId ?? "", period: new Date().toISOString().slice(0, 7) });
      setEditId(null);
      load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menyimpan" });
    } finally {
      setBusy(false);
    }
  }

  async function doWorkflow(id: string, action: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/borang/entries/${id}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal memproses");
      setMsg({ type: "ok", text: "Entri terkirim untuk verifikasi." });
      load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal memproses" });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(e: Entry) {
    setEditId(e.id);
    setForm({
      staffId: e.staff.id,
      roomId: rooms.find((r) => r.name === e.room?.name)?.id ?? "",
      period: e.period,
      patientIdentifier: e.patientIdentifier,
      actionType: e.actionType,
      quantity: String(e.quantity),
      notes: e.notes ?? "",
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

      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>{editId ? "Ubah Entri" : "Catat Tindakan"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="Petugas" required>
                <Select
                  value={form.staffId}
                  onChange={(e) => setForm((p) => ({ ...p, staffId: e.target.value }))}
                  disabled={busy}
                >
                  <option value="">— Pilih petugas —</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.profession})
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Ruangan">
                <Select
                  value={form.roomId}
                  onChange={(e) => setForm((p) => ({ ...p, roomId: e.target.value }))}
                  disabled={busy}
                >
                  <option value="">— Pilih ruangan —</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Periode" required hint="Format YYYY-MM">
                <Input
                  type="month"
                  value={form.period}
                  onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))}
                  disabled={busy}
                />
              </FormField>
              <FormField
                label="Identitas Pasien (anonim)"
                required
                hint="TN.X atau NY.X — nama lengkap dilarang"
              >
                <Input
                  value={form.patientIdentifier}
                  onChange={(e) => setForm((p) => ({ ...p, patientIdentifier: e.target.value }))}
                  placeholder="TN.A"
                  disabled={busy}
                />
              </FormField>
              <FormField label="Tindakan" required>
                <Input
                  value={form.actionType}
                  onChange={(e) => setForm((p) => ({ ...p, actionType: e.target.value }))}
                  list="action-types"
                  placeholder="cth. Pemasangan infus"
                  disabled={busy}
                />
                <datalist id="action-types">
                  {ACTIONS.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </FormField>
              <FormField label="Jumlah" required>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={form.quantity}
                  onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
                  disabled={busy}
                />
              </FormField>
              <FormField label="Catatan" className="sm:col-span-3">
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  className="min-h-[60px]"
                  disabled={busy}
                />
              </FormField>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              {editId && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditId(null);
                    setForm({ ...EMPTY_FORM, staffId: myStaffId ?? "", period: new Date().toISOString().slice(0, 7) });
                  }}
                  type="button"
                >
                  Batal Edit
                </Button>
              )}
              <Button variant="primary" size="sm" loading={busy} onClick={submitForm} type="button">
                {editId ? "Simpan Perubahan" : "Simpan sebagai Draf"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
          <Select
            className="w-40"
            value={filters.status}
            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="">Semua</option>
            {["DRAFT", "SUBMITTED", "VERIFICATION", "APPROVED", "REJECTED", "ARCHIVED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Periode</label>
          <Input
            type="month"
            className="w-40"
            value={filters.period}
            onChange={(e) => setFilters((p) => ({ ...p, period: e.target.value }))}
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-slate-700 mb-1">Cari</label>
          <Input
            value={filters.search}
            onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
            placeholder="Tindakan / petugas / TN.X"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entri ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
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
                    Tidak ada entri.
                  </Td>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id}>
                    <Td className="text-xs font-mono">{e.period}</Td>
                    <Td className="text-xs">{e.staff.name}</Td>
                    <Td className="text-xs">{e.room?.name ?? "—"}</Td>
                    <Td className="text-xs font-mono">{e.patientIdentifier}</Td>
                    <Td className="text-xs">
                      {e.actionType}
                      {e.status === "REJECTED" && e.rejectReason && (
                        <p className="text-[10px] text-red-600 mt-0.5">
                          Ditolak: {e.rejectReason}
                        </p>
                      )}
                    </Td>
                    <Td className="text-xs">{e.quantity}</Td>
                    <Td>
                      <BorangStatusBadge status={e.status} />
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {canUpdate && ["DRAFT", "REJECTED"].includes(e.status) && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Ubah"
                          onClick={() => startEdit(e)}
                          disabled={busy}
                        >
                          <Pencil size={13} className="text-slate-500" />
                        </Button>
                      )}
                      {canSubmit && ["DRAFT", "REJECTED"].includes(e.status) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => doWorkflow(e.id, "SUBMIT")}
                          disabled={busy}
                        >
                          <Send size={12} /> Kirim
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
