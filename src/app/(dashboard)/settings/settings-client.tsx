"use client";

import * as React from "react";
import { Section, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormField, Input } from "@/components/ui/form";

interface Room {
  id: string;
  name: string;
  code: string | null;
}
interface Competency {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export function SettingsClient({
  rooms,
  competencies,
}: {
  rooms: Room[];
  competencies: Competency[];
}) {
  const [roomName, setRoomName] = React.useState("");
  const [compName, setCompName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function post(url: string, body: unknown, done: () => void) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setMsg({ type: "err", text: json.error?.message ?? "Gagal menyimpan" });
        return;
      }
      setMsg({ type: "ok", text: "Tersimpan." });
      done();
    } catch {
      setMsg({ type: "err", text: "Terjadi kesalahan jaringan." });
    } finally {
      setBusy(false);
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rooms */}
        <Card>
          <CardHeader>
            <CardTitle>Ruangan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!roomName.trim()) return;
                post("/api/admin/rooms", { name: roomName.trim() }, () => {
                  setRoomName("");
                  setTimeout(() => window.location.reload(), 600);
                });
              }}
            >
              <FormField label="Ruangan baru" htmlFor="room-name" className="flex-1">
                <Input
                  id="room-name"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="cth. IGD, ICU, VIP"
                  disabled={busy}
                />
              </FormField>
              <Button type="submit" size="md" loading={busy}>
                Tambah
              </Button>
            </form>
            <Table scroll>
              <TableHeader>
                <TableRow>
                  <Th>Nama</Th>
                  <Th>Kode</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.length === 0 ? (
                  <TableRow>
                    <Td colSpan={2} className="text-center text-xs text-slate-400 py-6">
                      Belum ada ruangan
                    </Td>
                  </TableRow>
                ) : (
                  rooms.map((r) => (
                    <TableRow key={r.id}>
                      <Td className="text-sm">{r.name}</Td>
                      <Td className="text-xs font-mono text-slate-500">{r.code ?? "—"}</Td>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Competencies */}
        <Card>
          <CardHeader>
            <CardTitle>Kompetensi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!compName.trim()) return;
                post("/api/admin/competencies", { name: compName.trim() }, () => {
                  setCompName("");
                  setTimeout(() => window.location.reload(), 600);
                });
              }}
            >
              <FormField label="Kompetensi baru" htmlFor="comp-name" className="flex-1">
                <Input
                  id="comp-name"
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="cth. VENTILATOR"
                  disabled={busy}
                />
              </FormField>
              <Button type="submit" size="md" loading={busy}>
                Tambah
              </Button>
            </form>
            <div className="flex flex-wrap gap-2">
              {competencies.length === 0 ? (
                <p className="text-xs text-slate-400">Belum ada kompetensi.</p>
              ) : (
                competencies.map((c) => (
                  <Badge key={c.id} variant={c.isActive ? "active" : "draft"}>
                    {c.name}
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Section title="Tampilan" description="Mode gelap/terang mengikuti pengaturan sistem (menyusul)">
        <p className="text-xs text-slate-500">
          Pengaturan tema akan mengikuti preferensi perangkat. Kontrol manual menyusul pada rilis
          berikutnya.
        </p>
      </Section>
    </div>
  );
}
