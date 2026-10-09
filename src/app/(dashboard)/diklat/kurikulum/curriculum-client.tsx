"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileUp, Plus } from "lucide-react";
import { CURRICULUM_STATUS_LABELS } from "@/lib/diklat/shared";

interface ProgramRow {
  id: string;
  year: number;
  name: string;
  description: string | null;
  status: string;
  hasDocument: boolean;
  documentName: string | null;
  itemCount: number;
  itemStatuses: string[];
}

const STATUSES = Object.keys(CURRICULUM_STATUS_LABELS);

export function CurriculumClient({
  programs,
  canManage,
}: {
  programs: ProgramRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const [form, setForm] = React.useState({ year: String(currentYear), name: "", description: "", status: "DIRANCANG" });
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/diklat/curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(form.year),
          name: form.name,
          description: form.description || null,
          status: form.status,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal menyimpan");
      setMsg({ type: "ok", text: "Program kurikulum dibuat." });
      setForm({ year: String(currentYear), name: "", description: "", status: "DIRANCANG" });
      router.refresh();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menyimpan" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div role="status" className={`rounded-md border px-4 py-2.5 text-xs ${msg.type === "ok" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Program Kurikulum Baru</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Tahun *</span>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-slate-500">Nama Program *</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="cth. Kurikulum Diklat Keperawatan 2026"
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs"
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Status</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CURRICULUM_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-slate-500">Deskripsi</span>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" size="sm" loading={busy} disabled={!form.name.trim()} onClick={create}>
                <Plus size={12} /> Buat Program
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{programs.length} Program</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table scroll>
            <TableHeader>
              <TableRow>
                <Th>Tahun</Th>
                <Th>Nama Program</Th>
                <Th>Status</Th>
                <Th className="text-right">Materi</Th>
                <Th>Dokumen</Th>
                <Th></Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programs.length === 0 ? (
                <TableRow>
                  <Td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                    Belum ada program kurikulum.
                  </Td>
                </TableRow>
              ) : (
                programs.map((p) => (
                  <TableRow key={p.id}>
                    <Td className="text-xs tabular-nums">{p.year}</Td>
                    <Td className="text-xs font-medium">
                      <Link href={`/diklat/kurikulum/${p.id}`} className="text-blue-700 hover:underline">
                        {p.name}
                      </Link>
                    </Td>
                    <Td className="text-xs">
                      <Badge variant={p.status === "SELESAI" ? "active" : p.status === "DIBATALKAN" ? "expired" : "info"}>
                        {CURRICULUM_STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    </Td>
                    <Td className="text-right text-xs tabular-nums">{p.itemCount}</Td>
                    <Td className="text-xs text-slate-500">
                      {p.hasDocument ? (
                        <span className="inline-flex items-center gap-1">
                          <FileUp size={12} /> {p.documentName}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-right">
                      <Link href={`/diklat/kurikulum/${p.id}`} className="text-xs text-blue-700 hover:underline">
                        Kelola →
                      </Link>
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
