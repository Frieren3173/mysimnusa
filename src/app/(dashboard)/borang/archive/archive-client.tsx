"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { BorangStatusBadge } from "@/components/ui/badge";
import { Archive } from "lucide-react";

interface Entry {
  id: string;
  period: string;
  patientIdentifier: string;
  actionType: string;
  quantity: number;
  status: string;
  approvedAt: string | null;
  archivedAt: string | null;
  staff: { id: string; name: string; profession: string };
  room: { name: string } | null;
}

export function ArchiveClient({ canArchive }: { canArchive: boolean }) {
  const [approved, setApproved] = React.useState<Entry[]>([]);
  const [archived, setArchived] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all(
        ["APPROVED", "ARCHIVED"].map(async (status) => {
          const res = await fetch(`/api/borang/entries?status=${status}&perPage=100`);
          const json = await res.json();
          return json?.success ? (json.data.data as Entry[]) : [];
        })
      );
      setApproved(a);
      setArchived(b);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function archive(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/borang/entries/${id}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ARCHIVE" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal mengarsipkan");
      setMsg({ type: "ok", text: "Entri berhasil diarsipkan." });
      load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal mengarsipkan" });
    } finally {
      setBusy(null);
    }
  }

  const cols = 7;

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
          <CardTitle>Menunggu Arsip ({approved.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table scroll>
            <TableHeader>
              <TableRow>
                <Th>Periode</Th>
                <Th>Petugas</Th>
                <Th>Ruangan</Th>
                <Th>Tindakan</Th>
                <Th>Jumlah</Th>
                <Th>Disetujui</Th>
                <Th></Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <Td colSpan={cols} className="text-center text-xs text-slate-400 py-8">
                    Memuat…
                  </Td>
                </TableRow>
              ) : approved.length === 0 ? (
                <TableRow>
                  <Td colSpan={cols} className="text-center text-xs text-slate-400 py-8">
                    Tidak ada entri menunggu arsip.
                  </Td>
                </TableRow>
              ) : (
                approved.map((e) => (
                  <TableRow key={e.id}>
                    <Td className="text-xs font-mono">{e.period}</Td>
                    <Td className="text-xs">{e.staff.name}</Td>
                    <Td className="text-xs">{e.room?.name ?? "—"}</Td>
                    <Td className="text-xs">{e.actionType}</Td>
                    <Td className="text-xs">{e.quantity}</Td>
                    <Td className="text-xs text-slate-500">
                      {e.approvedAt ? new Date(e.approvedAt).toLocaleDateString("id-ID") : "—"}
                    </Td>
                    <Td className="text-right">
                      {canArchive && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy !== null}
                          loading={busy === e.id}
                          onClick={() => archive(e.id)}
                        >
                          <Archive size={12} /> Arsipkan
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

      <Card>
        <CardHeader>
          <CardTitle>Arsip ({archived.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table scroll>
            <TableHeader>
              <TableRow>
                <Th>Periode</Th>
                <Th>Petugas</Th>
                <Th>Ruangan</Th>
                <Th>Tindakan</Th>
                <Th>Jumlah</Th>
                <Th>Status</Th>
                <Th>Tanggal Arsip</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {archived.length === 0 ? (
                <TableRow>
                  <Td colSpan={cols} className="text-center text-xs text-slate-400 py-8">
                    Belum ada arsip.
                  </Td>
                </TableRow>
              ) : (
                archived.map((e) => (
                  <TableRow key={e.id}>
                    <Td className="text-xs font-mono">{e.period}</Td>
                    <Td className="text-xs">{e.staff.name}</Td>
                    <Td className="text-xs">{e.room?.name ?? "—"}</Td>
                    <Td className="text-xs">{e.actionType}</Td>
                    <Td className="text-xs">{e.quantity}</Td>
                    <Td>
                      <BorangStatusBadge status={e.status} />
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {e.archivedAt ? new Date(e.archivedAt).toLocaleDateString("id-ID") : "—"}
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
