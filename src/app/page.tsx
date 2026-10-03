import Link from "next/link";
import {
  Users,
  FileText,
  GraduationCap,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Data SDM Keperawatan",
    description:
      "Database terpusat perawat dan bidan: identitas, kepegawaian, struktur unit, dan riwayat karier.",
  },
  {
    icon: ShieldCheck,
    title: "Legalitas & Sertifikat",
    description:
      "Pelacakan STR, izin praktik, dan sertifikat kompetensi dengan peringatan masa berlaku otomatis.",
  },
  {
    icon: FileText,
    title: "Borang & Dokumen",
    description:
      "Pengelolaan borang akreditasi dan dokumen komite dengan alur pengajuan dan persetujuan.",
  },
  {
    icon: GraduationCap,
    title: "Diklat & Kompetensi",
    description:
      "Jadwal pelatihan, rekam jejak diklat, dan pemetaan kompetensi per perawat.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white">
              RS
            </span>
            <span className="text-sm font-semibold text-slate-900">
              RSAJT Nursing
            </span>
          </div>
          <Link
            href="/login"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Masuk
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-blue-600">
              Sistem Internal · Rumah Sakit Al-Jihad Tangerang
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Manajemen Keperawatan dalam satu platform
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Platform terintegrasi untuk Komite Keperawatan, Borang, dan
              Diklat. Mengelola data SDM Perawat dan Bidan secara
              profesional, akurat, dan akuntabel.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-6 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Masuk ke Sistem
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto w-full max-w-6xl px-6 py-16">
            <h2 className="text-xl font-semibold text-slate-900">
              Modul tersedia
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <feature.icon
                    className="h-5 w-5 text-blue-600"
                    aria-hidden="true"
                  />
                  <h3 className="mt-3 text-sm font-semibold text-slate-900">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Rumah Sakit Al-Jihad Tangerang · Sistem Internal</p>
          <p>© {new Date().getFullYear()} RSAJT Nursing Management System</p>
        </div>
      </footer>
    </div>
  );
}
