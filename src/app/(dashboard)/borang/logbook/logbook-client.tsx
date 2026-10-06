"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, FormField } from "@/components/ui/form";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { BorangStatusBadge } from "@/components/ui/badge";
import { Download, Pencil, Send } from "lucide-react";
import { expandPatientRows } from "@/lib/borang";

interface Entry {
  id: string;
  period: string;
  patientIdentifier: string;
  rmNumber: string | null;
  actionType: string;
  nursingActionId: string | null;
  quantity: number;
  notes: string | null;
  status: string;
  rejectReason: string | null;
  createdAt: string;
  staff: { id: string; name: string; profession: string };
  room: { name: string } | null;
}

interface MasterAction {
  id: string;
  code: string;
  name: string;
}

const EMPTY_FORM = {
  staffId: "",
  roomId: "",
  period: "",
  actionType: "",
  nursingActionId: "",
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
  const [exportStaffId, setExportStaffId] = React.useState(myStaffId ?? "");
  const [exportYear, setExportYear] = React.useState(String(new Date().getFullYear()));
  const [form, setForm] = React.useState({
    ...EMPTY_FORM,
    staffId: myStaffId ?? "",
    period: new Date().toISOString().slice(0, 7),
  });
  const [editId, setEditId] = React.useState<string | null>(null);
  const [roomActions, setRoomActions] = React.useState<MasterAction[]>([]);
  const [actionsLoading, setActionsLoading] = React.useState(false);

  // Anonymised patient rows derived from the loaded entries (quantity → N rows,
  // unique initials + unique No. RM). Nothing is persisted — display only.
  const patientRows = React.useMemo(
    () =>
      expandPatientRows(
        entries.map((e) => ({
          period: e.period,
          patientIdentifier: e.patientIdentifier,
          rmNumber: e.rmNumber,
          actionType: e.actionType,
          quantity: e.quantity,
        }))
      ),
    [entries]
  );

  React.useEffect(() => {
    const roomId = form.roomId;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!roomId) {
        setRoomActions([]);
        return;
      }
      setActionsLoading(true);
      fetch(`/api/borang/actions?roomId=${encodeURIComponent(roomId)}`)
        .then((res) => res.json())
        .then((json) => {
          if (cancelled) return;
          if (json?.success) setRoomActions(json.data.data);
          else setRoomActions([]);
        })
        .catch(() => {
          if (!cancelled) setRoomActions([]);
        })
        .finally(() => {
          if (!cancelled) setActionsLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.roomId]);

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
        actionType: form.actionType,
        nursingActionId: form.nursingActionId || null,
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
      actionType: e.actionType,
      nursingActionId: e.nursingActionId ?? "",
      quantity: String(e.quantity),
      notes: e.notes ?? "",
    });
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onActionChange(value: string) {
    const match = roomActions.find((a) => a.name === value);
    setForm((p) => ({ ...p, actionType: value, nursingActionId: match?.id ?? "" }));
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
              <FormField
                label="Ruangan"
                hint="Menentukan format kode pasien (otomatis)"
              >
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
                label="Tindakan"
                required
                hint={
                  !form.roomId
                    ? "Pilih ruangan terlebih dahulu."
                    : actionsLoading
                      ? "Memuat tindakan…"
                      : roomActions.length === 0
                        ? "Belum ada tindakan yang dikonfigurasi untuk ruangan ini."
                        : "Ketik untuk mencari dari master tindakan ruangan ini"
                }
              >
                <Input
                  value={form.actionType}
                  onChange={(e) => onActionChange(e.target.value)}
                  list="room-action-types"
                  placeholder={
                    !form.roomId
                      ? "— Pilih ruangan terlebih dahulu —"
                      : roomActions.length === 0
                        ? "Tindakan belum tersedia — ketik manual"
                        : "cth. Pemasangan Infus"
                  }
                  disabled={busy || !form.roomId || actionsLoading}
                />
                <datalist id="room-action-types">
                  {roomActions.map((a) => (
                    <option key={a.id} value={a.name} />
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
        <div className="ml-auto">
          <label className="block text-xs font-medium text-slate-700 mb-1">Export Rekap</label>
          <div className="flex items-end gap-2">
            <Select
              className="w-56"
              value={exportStaffId}
              onChange={(e) => setExportStaffId(e.target.value)}
            >
              <option value="">— Pilih petugas —</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.profession})
                </option>
              ))}
            </Select>
            <Input
              type="number"
              className="w-24"
              min={2020}
              max={2100}
              value={exportYear}
              onChange={(e) => setExportYear(e.target.value)}
            />
            {exportStaffId ? (
              <a
                href={`/api/borang/export?staffId=${exportStaffId}&year=${exportYear}`}
                title="Download rekap .docx (2 halaman: rekapitulasi + daftar pasien)"
                className="inline-flex h-8 select-none items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 active:bg-slate-100"
              >
                <Download size={12} /> Rekap (.docx)
              </a>
            ) : (
              <span className="inline-flex h-8 select-none items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-400 opacity-60">
                <Download size={12} /> Rekap (.docx)
              </span>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entri ({total})</CardTitle>
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
                    Tidak ada entri.
                  </Td>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id}>
                    <Td className="text-xs font-mono">{e.period}</Td>
                    <Td className="text-xs">{e.staff.name}</Td>
                    <Td className="text-xs">{e.room?.name ?? "—"}</Td>
                    <Td className="text-xs font-mono">
                      {e.patientIdentifier}
                      {e.rmNumber && (
                        <span className="block text-[10px] text-slate-400">RM {e.rmNumber}</span>
                      )}
                    </Td>
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

      {/* Daftar pasien (anonymized) — dihasilkan otomatis dari jumlah tindakan */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Pasien ({patientRows.length})</CardTitle>
          <span className="text-xs text-slate-500">
            Dibuat otomatis dari jumlah tindakan — inisial &amp; No. RM unik per dokumen
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table scroll>
            <TableHeader>
              <TableRow>
                <Th className="w-12">No</Th>
                <Th>Nama Pasien</Th>
                <Th>No. RM</Th>
                <Th>Tindakan</Th>
                <Th className="text-center">Jumlah</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patientRows.length === 0 ? (
                <TableRow>
                  <Td colSpan={5} className="text-center text-xs text-slate-400 py-8">
                    Belum ada data pasien.
                  </Td>
                </TableRow>
              ) : (
                patientRows.map((p) => (
                  <TableRow key={`${p.no}-${p.rmNumber}`}>
                    <Td className="text-xs tabular-nums text-slate-500">{p.no}</Td>
                    <Td className="text-xs font-mono font-medium text-slate-900">{p.name}</Td>
                    <Td className="text-xs font-mono text-slate-600">{p.rmNumber}</Td>
                    <Td className="text-xs">{p.actionType}</Td>
                    <Td className="text-center text-xs tabular-nums">{p.quantity}</Td>
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
