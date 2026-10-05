"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Unlink, RefreshCw, Sheet, Loader2, Database, FolderDown } from "lucide-react";

type Role = "SOURCE" | "DESTINATION";

interface ConnectionInfo {
  role: Role;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  email: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastCheckedAt: string | null;
}

interface StatusPayload {
  configured: boolean;
  source: ConnectionInfo;
  destination: ConnectionInfo;
  connections?: { source: ConnectionInfo; destination: ConnectionInfo };
}

const STATUS_VARIANT = { CONNECTED: "active", DISCONNECTED: "expiring", ERROR: "expired" } as const;

const ROLE_META: Record<
  Role,
  { title: string; description: string; scopeNote: string; icon: React.ReactNode }
> = {
  SOURCE: {
    title: "Akun Sumber (read-only)",
    description: "Legacy Google Drive & Sheets — hanya dibaca, tidak pernah menerima file baru.",
    scopeNote: "drive.readonly + spreadsheets.readonly",
    icon: <Database size={16} />,
  },
  DESTINATION: {
    title: "Akun Tujuan (penyimpanan produksi)",
    description: "Penyimpanan dokumen produksi MYSIMNUSA — hanya menulis, tidak pernah membaca data lama.",
    scopeNote: "drive.file (hanya file milik aplikasi ini)",
    icon: <FolderDown size={16} />,
  },
};

export function GoogleConnectionCard() {
  const [data, setData] = React.useState<StatusPayload | null>(null);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = React.useState<null | string>(null);
  const [sheetUrl, setSheetUrl] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/migration/status");
      const json = await res.json();
      if (json?.success) setData(json.data);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      load();
      const q = new URLSearchParams(window.location.search).get("google");
      if (q) {
        const map: Record<string, { type: "ok" | "err"; text: string }> = {
          connected_source: { type: "ok", text: "Akun SUMBER berhasil disambungkan (read-only)." },
          connected_destination: { type: "ok", text: "Akun TUJUAN berhasil disambungkan (penyimpanan produksi)." },
          connected: { type: "ok", text: "Akun Google berhasil disambungkan." },
          denied: { type: "err", text: "Otorisasi dibatalkan oleh pengguna." },
          expired: { type: "err", text: "Sesi otorisasi kedaluwarsa — coba lagi." },
          invalid: { type: "err", text: "Callback OAuth tidak valid." },
          forbidden: { type: "err", text: "Hanya Super Admin yang boleh menyambungkan." },
          not_configured: { type: "err", text: "GOOGLE_CLIENT_ID/SECRET belum diisi di .env." },
          error: { type: "err", text: "Gagal menukar kode otorisasi — coba lagi." },
        };
        setMsg(map[q!] ?? { type: "err", text: `Gagal menyambungkan (${q}).` });
        window.history.replaceState({}, "", window.location.pathname);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function connect(role: Role) {
    setBusy(`connect:${role}`);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/migration/google/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal memulai otorisasi");
      const authUrl = json.data.url as string;
      window.location.assign(authUrl);
      return;
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal memulai otorisasi" });
      setBusy(null);
    }
  }

  async function disconnect(role: Role) {
    const label = role === "SOURCE" ? "akun SUMBER" : "akun TUJUAN";
    if (!confirm(`Putuskan koneksi ${label}? Token akan dicabut.`)) return;
    setBusy(`disconnect:${role}`);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/migration/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal memutus koneksi");
      setMsg({ type: "ok", text: `Koneksi ${label} diputus.` });
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal memutus koneksi" });
    } finally {
      setBusy(null);
    }
  }

  async function scan() {
    setBusy("scan");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/migration/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal memindai spreadsheet");
      const scanInfo = json.data.scan as { columns?: unknown[]; rowCount?: number } | undefined;
      setMsg({
        type: "ok",
        text: `Scan selesai — ${scanInfo?.rowCount ?? 0} baris, ${scanInfo?.columns?.length ?? 0} kolom terdeteksi. Batch siap di-review pemetaan.`,
      });
      setSheetUrl("");
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal memindai spreadsheet" });
      setBusy(null);
    }
  }

  const source = data?.connections?.source ?? data?.source;
  const destination = data?.connections?.destination ?? data?.destination;
  const sourceReady = source?.status === "CONNECTED";
  const destinationReady = destination?.status === "CONNECTED";

  return (
    <div className="space-y-4">
      {msg && (
        <div
          role="status"
          className={`rounded-md border px-4 py-2.5 text-xs ${
            msg.type === "ok" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      {data && !data.configured && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Kredensial OAuth belum diisi. Tambahkan <code className="font-mono">GOOGLE_CLIENT_ID</code> dan{" "}
          <code className="font-mono">GOOGLE_CLIENT_SECRET</code>, lalu restart server. Redirect URI:{" "}
          <code className="font-mono">/api/admin/migration/google/callback</code>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(["SOURCE", "DESTINATION"] as Role[]).map((role) => {
          const meta = ROLE_META[role];
          const info = role === "SOURCE" ? source : destination;
          const connected = info?.status === "CONNECTED";
          return (
            <Card key={role}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {meta.icon} {meta.title}
                    </CardTitle>
                    <CardDescription>{meta.description}</CardDescription>
                  </div>
                  {info && <Badge variant={STATUS_VARIANT[info.status]}>{info.status}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Akun terhubung</p>
                  <p className="text-xs font-medium text-slate-800 truncate">
                    {info?.email ?? "Belum ada akun"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-slate-200 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Cakupan akses</p>
                    <p className="text-[11px] text-slate-600 break-words">{meta.scopeNote}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Cek terakhir</p>
                    <p className="text-[11px] text-slate-600">
                      {info?.lastCheckedAt ? new Date(info.lastCheckedAt).toLocaleString("id-ID") : "—"}
                    </p>
                  </div>
                </div>
                {data?.configured && (
                  <div className="flex flex-wrap items-center gap-2">
                    {!connected ? (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={busy === `connect:${role}`}
                        onClick={() => connect(role)}
                      >
                        <Link2 size={12} /> {role === "SOURCE" ? "Sambungkan Akun Sumber" : "Sambungkan Akun Tujuan"}
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={busy === `disconnect:${role}`}
                        onClick={() => disconnect(role)}
                      >
                        <Unlink size={12} /> Putuskan
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {data?.configured && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Link2 size={16} /> Status Koneksi
                </CardTitle>
                <CardDescription>
                  Token OAuth disimpan terenkripsi (AES-256-GCM) dan tidak pernah dikirim ke browser.
                </CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={load} title="Muat ulang status">
                <RefreshCw size={12} /> Periksa
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!sourceReady || !destinationReady ? (
              <p className="text-xs text-amber-700">
                {!sourceReady && !destinationReady
                  ? "Kedua akun belum tersambung. Sambungkan akun SUMBER (read-only) dan akun TUJUAN (penyimpanan produksi)."
                  : !sourceReady
                    ? "Akun SUMBER belum tersambung — migrasi tidak dapat membaca data lama."
                    : "Akun TUJUAN belum tersambung — dokumen produksi tidak dapat disimpan."}
              </p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[280px] space-y-1">
                  <span className="text-xs text-slate-500">URL Google Spreadsheet (dari akun SUMBER)</span>
                  <input
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-mono focus:border-blue-500 focus:outline-none"
                  />
                </label>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!sheetUrl.trim() || busy !== null}
                  loading={busy === "scan"}
                  onClick={scan}
                >
                  <Sheet size={12} /> Scan Sheet
                </Button>
              </div>
            )}
            {!data && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 size={14} className="animate-spin" /> Memuat status koneksi…
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
