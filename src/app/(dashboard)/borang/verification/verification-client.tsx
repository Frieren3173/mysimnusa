"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { BorangStatusBadge } from "@/components/ui/badge";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

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

export function VerificationClient({
  canVerify,
  canApprove,
  canReject,
}: {
  canVerify: boolean;
  canApprove: boolean;
  canReject: boolean;
}) {
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        ["SUBMITTED", "VERIFICATION"].map(async (status) => {
          const res = await fetch(`/api/borang/entries?status=${status}&perPage=100`);
          const json = await res.json();
          return json?.success ? (json.data.data as Entry[]) : [];
        })
      );
      setEntries(results.flat());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function act(id: string, action: "VERIFY" | "APPROVE" | "REJECT") {
    let reason: string | undefined;
    if (action === "REJECT") {
      const input = prompt("Alasan penolakan (wajib):");
      if (!input || !input.trim()) return;
      reason = input.trim();
    }
    setBusy(id + action);
    setMsg(null);
    try {
      const res = await fetch(`/api/borang/entries/${id}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal memproses");
      setMsg({
        type: "ok",
        text:
          action === "VERIFY"
            ? "Diverifikasi — lanjut ke persetujuan."
            : action === "APPROVE"
              ? "Disetujui — siap diarsipkan."
              : "Ditolak dan dikembalikan ke petugas.",
      });
      load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal memproses" });
    } finally {
      setBusy(null);
    }
  }

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

      <Card>
        <CardHeader>
          <CardTitle>Antrean Verifikasi ({entries.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table scroll>
            <TableHeader>
              <TableRow>
                <Th>Periode</Th>
                <Th>Petugas</Th>
                <Th>Pasien</Th>
                <Th>Tindakan</Th>
                <Th>Jumlah</Th>
                <Th>Status</Th>
                <Th>Catatan Petugas</Th>
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
                    Tidak ada borang menunggu verifikasi. 🎉
                  </Td>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id}>
                    <Td className="text-xs font-mono">{e.period}</Td>
                    <Td className="text-xs">
                      {e.staff.name}
                      <p className="text-[10px] text-slate-400">{e.staff.profession}</p>
                    </Td>
                    <Td className="text-xs font-mono">{e.patientIdentifier}</Td>
                    <Td className="text-xs">{e.actionType}</Td>
                    <Td className="text-xs">{e.quantity}</Td>
                    <Td>
                      <BorangStatusBadge status={e.status} />
                    </Td>
                    <Td className="text-xs text-slate-500 max-w-[180px] truncate">
                      {e.notes ?? "—"}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {e.status === "SUBMITTED" && (
                        <>
                          {canVerify && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy !== null}
                              loading={busy === e.id + "VERIFY"}
                              onClick={() => act(e.id, "VERIFY")}
                            >
                              <ShieldCheck size={12} /> Verifikasi
                            </Button>
                          )}{" "}
                          {canReject && (
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busy !== null}
                              loading={busy === e.id + "REJECT"}
                              onClick={() => act(e.id, "REJECT")}
                            >
                              <XCircle size={12} /> Tolak
                            </Button>
                          )}
                        </>
                      )}
                      {e.status === "VERIFICATION" && (
                        <>
                          {canApprove && (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={busy !== null}
                              loading={busy === e.id + "APPROVE"}
                              onClick={() => act(e.id, "APPROVE")}
                            >
                              <CheckCircle2 size={12} /> Setujui
                            </Button>
                          )}{" "}
                          {canReject && (
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busy !== null}
                              loading={busy === e.id + "REJECT"}
                              onClick={() => act(e.id, "REJECT")}
                            >
                              <XCircle size={12} /> Tolak
                            </Button>
                          )}
                        </>
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
