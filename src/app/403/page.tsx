import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Akses Ditolak" };

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <p className="text-5xl font-bold text-slate-900 tabular-nums">403</p>
      <h1 className="mt-4 text-lg font-semibold text-slate-800">Akses ditolak</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        Anda tidak memiliki izin untuk membuka halaman ini. Hubungi administrator jika merasa
        seharusnya punya akses.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Kembali ke Dashboard
        </Link>
        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Beranda
        </Link>
      </div>
    </div>
  );
}
