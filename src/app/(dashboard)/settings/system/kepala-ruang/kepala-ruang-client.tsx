"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { AlertItem } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface RoomRow {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  subcategory: string | null;
  kepalaRuang: {
    id: string;
    userId: string;
    staffId: string | null;
    name: string;
    nip: string | null;
  } | null;
}

interface Candidate {
  id: string;
  username: string;
  email: string;
  staffId: string | null;
  name: string;
  nip: string | null;
}

export function KepalaRuangClient({
  initialRooms,
  candidates,
}: {
  initialRooms: RoomRow[];
  candidates: Candidate[];
}) {
  const [rooms, setRooms] = React.useState(initialRooms);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  const unassigned = rooms.filter((r) => !r.kepalaRuang).length;

  async function assign(roomId: string, userId: string) {
    setBusy(roomId);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/rooms/kepala-ruang", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userId: userId || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal menyimpan");

      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId
            ? { ...r, kepalaRuang: json.data.kepalaRuang ?? null }
            : r,
        ),
      );
      setMsg({ type: "ok", text: "Penugasan Kepala Ruang disimpan." });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menyimpan" });
    } finally {
      setBusy(null);
    }
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

      {unassigned > 0 ? (
        <AlertItem
          type="warning"
          title={`${unassigned} ruangan belum memiliki Kepala Ruang`}
          description="Pengajuan Borang dari ruangan tanpa Kepala Ruang tidak dapat disubmit sampai penugasan dibuat."
        />
      ) : (
        <AlertItem
          type="success"
          title="Semua ruangan sudah memiliki Kepala Ruang"
          description="Pengajuan Borang dapat diteruskan ke antrean review Kepala Ruang."
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pemetaan Ruangan → Kepala Ruang ({rooms.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table scroll>
            <TableHeader>
              <TableRow>
                <Th>Ruangan</Th>
                <Th>Kategori</Th>
                <Th>Kepala Ruang</Th>
                <Th>NIP</Th>
                <Th>Tetapkan</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.length === 0 ? (
                <TableRow>
                  <Td colSpan={5} className="text-center text-xs text-slate-400 py-8">
                    Belum ada ruangan aktif.
                  </Td>
                </TableRow>
              ) : (
                rooms.map((r) => (
                  <TableRow key={r.id}>
                    <Td className="text-xs font-medium">{r.name}</Td>
                    <Td className="text-xs text-slate-500">
                      {r.category ?? "—"}
                      {r.subcategory ? ` · ${r.subcategory}` : ""}
                    </Td>
                    <Td className="text-xs">
                      {r.kepalaRuang ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                          <CheckCircle2 size={13} /> {r.kepalaRuang.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-amber-700">
                          <AlertTriangle size={13} /> Belum ditetapkan
                        </span>
                      )}
                    </Td>
                    <Td className="text-xs font-mono text-slate-600">
                      {r.kepalaRuang?.nip ?? "—"}
                    </Td>
                    <Td>
                      <Select
                        aria-label={`Kepala Ruang untuk ${r.name}`}
                        className="w-56"
                        value={r.kepalaRuang?.userId ?? ""}
                        disabled={busy !== null}
                        onChange={(e) => assign(r.id, e.target.value)}
                      >
                        <option value="">— Tidak ada —</option>
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.nip ? ` (${c.nip})` : ""}
                          </option>
                        ))}
                      </Select>
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        Hanya pengguna dengan peran <strong>KEPALA_RUANG</strong> yang aktif yang muncul sebagai kandidat.
        Penugasan ini menentukan siapa yang dapat mereview Borang ruangan tersebut.
      </p>
    </div>
  );
}
