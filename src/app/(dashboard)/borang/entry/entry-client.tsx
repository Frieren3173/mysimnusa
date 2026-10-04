"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface StaffOpt {
  id: string;
  name: string;
  profession: string;
  roomId: string | null;
}
interface RoomOpt {
  id: string;
  name: string;
}

export function EntryClient({
  staff,
  rooms,
  defaultStaffId,
  defaultRoomId,
  canSubmit,
}: {
  staff: StaffOpt[];
  rooms: RoomOpt[];
  defaultStaffId: string;
  defaultRoomId: string | null;
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<null | "draft" | "submit">(null);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = React.useState({
    staffId: defaultStaffId,
    roomId: defaultRoomId ?? "",
    period: new Date().toISOString().slice(0, 7),
    actionType: "",
    quantity: "1",
    notes: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(andSubmit: boolean) {
    setBusy(andSubmit ? "submit" : "draft");
    setMsg(null);
    try {
      const res = await fetch("/api/borang/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: form.staffId || undefined,
          roomId: form.roomId || null,
          period: form.period,
          actionType: form.actionType,
          quantity: Number(form.quantity),
          notes: form.notes || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        const fields = json?.error?.fields
          ? Object.values(json.error.fields as Record<string, string[]>).flat().join("; ")
          : "";
        throw new Error((json?.error?.message ?? "Gagal menyimpan") + (fields ? ` — ${fields}` : ""));
      }
      const entryId = json.data.entry.id as string;

      if (andSubmit) {
        const w = await fetch(`/api/borang/entries/${entryId}/workflow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "SUBMIT" }),
        });
        const wj = await w.json().catch(() => null);
        if (!w.ok || !wj?.success) throw new Error(wj?.error?.message ?? "Gagal mengirim");
        setMsg({ type: "ok", text: "Borang tersimpan dan dikirim untuk verifikasi." });
      } else {
        setMsg({ type: "ok", text: "Borang tersimpan sebagai draf." });
      }

      setTimeout(() => router.push("/borang/logbook"), 700);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menyimpan" });
    } finally {
      setBusy(null);
    }
  }

  const inputCls =
    "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-none";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Formulir Tindakan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Petugas *</span>
            <select value={form.staffId} onChange={set("staffId")} className={inputCls}>
              <option value="">— Pilih petugas —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.profession}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-500">Ruangan</span>
            <select value={form.roomId} onChange={set("roomId")} className={inputCls}>
              <option value="">— Tanpa ruangan —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-500">Periode (YYYY-MM) *</span>
            <input type="month" value={form.period} onChange={set("period")} className={inputCls} />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-slate-500">Tindakan *</span>
            <input
              value={form.actionType}
              onChange={set("actionType")}
              placeholder="mis. Pemasangan infus"
              maxLength={200}
              className={inputCls}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-500">Jumlah (1–999) *</span>
            <input
              type="number"
              min={1}
              max={999}
              value={form.quantity}
              onChange={set("quantity")}
              className={inputCls}
            />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-slate-500">Catatan</span>
            <textarea
              value={form.notes}
              onChange={set("notes")}
              rows={3}
              maxLength={1000}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>

        <p className="text-xs text-slate-400">
          Kode pasien (Tn.X / Ny.X / By.) dan No. RM dibuat otomatis saat disimpan — menyesuaikan
          ruangan, tanpa data asli pasien.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={busy !== null} loading={busy === "draft"} onClick={() => save(false)}>
            Simpan Draf
          </Button>
          {canSubmit && (
            <Button variant="primary" size="sm" disabled={busy !== null} loading={busy === "submit"} onClick={() => save(true)}>
              Simpan & Kirim
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
