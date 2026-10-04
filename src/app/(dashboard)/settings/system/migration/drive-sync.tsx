"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HardDriveDownload, RefreshCw, Trash2, Square, Play, Loader2 } from "lucide-react";

interface SyncStatus {
  total: number;
  migrated: number;
  pending: number;
  ready: number;
  failed: number;
  percent: number;
  duplicates: number;
}

interface SyncResult {
  processed: number;
  succeeded: number;
  failed: number;
  failures: { id: string; name: string; error: string }[];
  status: SyncStatus;
}

export function DriveSyncCard() {
  const [st, setSt] = React.useState<SyncStatus | null>(null);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [running, setRunning] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "dedup" | "retry">(null);
  const [failures, setFailures] = React.useState<SyncResult["failures"]>([]);
  const stopRef = React.useRef(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/migration/sync-status");
      const json = await res.json();
      if (json?.success) setSt(json.data);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run() {
    setRunning(true);
    stopRef.current = false;
    setMsg(null);
    setFailures([]);
    let errStreak = 0;
    try {
      while (!stopRef.current) {
        const res = await fetch("/api/admin/migration/sync-drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 8 }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          errStreak++;
          if (errStreak >= 3) {
            setMsg({ type: "err", text: json?.error?.message ?? "Sinkronisasi gagal — server bermasalah." });
            break;
          }
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        errStreak = 0;
        const d: SyncResult = json.data;
        setSt(d.status);
        if (d.failures.length > 0) setFailures((prev) => [...d.failures, ...prev].slice(0, 25));
        if (d.status.ready === 0) {
          setMsg(
            d.status.failed > 0
              ? {
                  type: "err",
                  text: `Berhenti — ${d.status.migrated} berkas tersimpan, ${d.status.failed} gagal diunduh (cek akses file).`,
                }
              : {
                  type: "ok",
                  text: `Selesai — semua ${d.status.migrated} berkas tersimpan di database lokal.`,
                }
          );
          break;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    } finally {
      setRunning(false);
    }
  }

  function stop() {
    stopRef.current = true;
  }

  async function retryFailed() {
    setBusy("retry");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/migration/sync-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 0, resetFailed: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal mereset");
      setSt(json.data.status);
      setMsg({ type: "ok", text: "Daftar gagal direset — jalankan sinkronisasi lagi untuk mencoba ulang." });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal mereset daftar gagal" });
    } finally {
      setBusy(null);
    }
  }

  async function dedup() {
    if (!confirm("Hapus baris dokumen duplikat? Satu baris tetap dipertahankan per grup.")) return;
    setBusy("dedup");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/migration/dedup", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal menghapus duplikat");
      const d = json.data as { removed: number; groups: number };
      setMsg(
        d.removed > 0
          ? { type: "ok", text: `${d.removed} baris dobel dihapus dari ${d.groups} grup duplikat.` }
          : { type: "ok", text: "Tidak ada duplikat — data bersih." }
      );
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menghapus duplikat" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardDriveDownload size={16} /> Sinkronisasi Berkas Drive → Database
            </CardTitle>
            <CardDescription>
              Tarik file dari link Google Drive yang tersimpan, simpan ke storage lokal, lalu hapus
              linknya. Setelah itu dokumen diambil dari database kita sendiri.
            </CardDescription>
          </div>
          {st && (
            <Badge variant={st.ready > 0 ? "expiring" : "active"}>
              {st.ready > 0 ? `${st.ready} menunggu` : st.total > 0 ? "Tertangani" : "Kosong"}
            </Badge>
          )}
        </div>
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

        {!st ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Memuat status sinkronisasi…
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">
                {st.migrated} / {st.total} berkas tersimpan di database
              </span>
              <span className="font-bold text-slate-900">{st.percent}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                style={{ width: `${st.percent}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
                Menunggu: {st.pending}
              </span>
              <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">
                Siap diunduh: {st.ready}
              </span>
              <span className="rounded bg-red-50 px-2 py-0.5 text-red-700">Gagal: {st.failed}</span>
              <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                Duplikat: {st.duplicates}
              </span>
            </div>
          </div>
        )}

        {failures.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-md border border-red-200 bg-red-50/50 divide-y divide-red-100">
            {failures.map((f, i) => (
              <div key={`${f.id}-${i}`} className="flex items-center gap-3 px-3 py-1.5">
                <span className="text-xs font-medium text-slate-700 shrink-0">{f.name}</span>
                <span className="text-xs text-red-600 truncate">{f.error}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!running ? (
            <Button
              variant="primary"
              size="sm"
              disabled={!st || st.ready === 0}
              onClick={run}
            >
              <Play size={12} /> {st && st.migrated > 0 ? "Lanjutkan Sinkronisasi" : "Mulai Sinkronisasi"}
            </Button>
          ) : (
            <Button variant="danger" size="sm" onClick={stop}>
              <Square size={12} /> Hentikan
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={busy === "dedup"}
            disabled={running || !st || st.duplicates === 0}
            onClick={dedup}
          >
            <Trash2 size={12} /> Hapus Duplikat {st ? `(${st.duplicates})` : ""}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={busy === "retry"}
            disabled={running || !st || st.failed === 0}
            onClick={retryFailed}
          >
            <RefreshCw size={12} /> Ulangi Gagal {st ? `(${st.failed})` : ""}
          </Button>
          <Button variant="ghost" size="sm" onClick={load} disabled={running} title="Muat ulang status">
            <RefreshCw size={12} /> Muat Ulang
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
