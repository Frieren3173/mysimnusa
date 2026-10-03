"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SlidesManager({ slides }: { slides: string[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const f of Array.from(files)) form.append("files", f);
      const res = await fetch("/api/admin/slides", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal mengunggah");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunggah");
      setBusy(false);
    }
  }

  async function remove(name: string) {
    if (!window.confirm(`Hapus slide "${name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/slides/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal menghapus");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Foto yang tampil di carousel dashboard (JPG/PNG/WEBP, maks 5 MB per file).
        </p>
        <Button variant="secondary" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
          <Upload size={13} />
          Tambah Foto
        </Button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {slides.length === 0 ? (
        <p className="text-xs text-slate-400">Belum ada foto slide.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {slides.map((name) => (
            <div key={name} className="group relative overflow-hidden rounded-md border border-slate-200">
              <div className="relative h-24 w-full">
                <Image
                  src={`/uploads/slides/${encodeURIComponent(name)}`}
                  alt={name}
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(name)}
                aria-label={`Hapus ${name}`}
                className="absolute right-1 top-1 rounded-md bg-white/90 p-1.5 text-red-600 opacity-0 shadow-sm transition-opacity hover:bg-red-600 hover:text-white group-hover:opacity-100 disabled:opacity-50"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
