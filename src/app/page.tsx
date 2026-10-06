import Link from "next/link";
import Image from "next/image";
import {
  Users,
  FileText,
  GraduationCap,
  ShieldCheck,
  ArrowRight,
  Activity,
  ClipboardCheck,
  BadgeCheck,
} from "lucide-react";

const modules = [
  {
    icon: Users,
    tag: "Komite Keperawatan",
    title: "Data SDM Perawat & Bidan",
    description:
      "Basis data terpusat tenaga keperawatan: identitas, kepegawaian, struktur unit, pendidikan, dan riwayat karier.",
  },
  {
    icon: ShieldCheck,
    tag: "Komite Keperawatan",
    title: "Legalitas & Kompetensi",
    description:
      "Pemantauan STR, SIP, dan sertifikat kompetensi dengan peringatan masa berlaku otomatis.",
  },
  {
    icon: FileText,
    tag: "Borang",
    title: "Borang & Dokumentasi",
    description:
      "Pengelolaan borang akreditasi, logbook tindakan, dan alur verifikasi yang tertelusur.",
  },
  {
    icon: GraduationCap,
    tag: "Diklat",
    title: "Pendidikan & Pelatihan",
    description:
      "Penjadwalan diklat, presensi, penilaian, dan penerbitan sertifikat dalam satu alur.",
  },
];

const capabilities = [
  {
    icon: Activity,
    label: "Data Terpusat",
    detail: "Satu sumber kebenaran untuk seluruh unit keperawatan.",
  },
  {
    icon: ClipboardCheck,
    label: "Alur Terverifikasi",
    detail: "Setiap pengajuan melalui pemeriksaan dan persetujuan.",
  },
  {
    icon: BadgeCheck,
    label: "Akuntabel",
    detail: "Jejak audit lengkap untuk setiap perubahan data.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3" data-motion-intro-child>
            <Image
              src="/logo-rsajt.png"
              alt="Logo Rumah Sakit Adhyaksa Jawa Timur"
              width={1430}
              height={721}
              priority
              className="h-8 w-auto"
            />
            <div className="min-w-0 border-l border-slate-200 pl-3">
              <p className="text-sm font-semibold leading-tight text-slate-900">MYSIMNUSA</p>
              <p className="text-[10px] leading-tight text-slate-500">
                Manajemen Keperawatan &amp; Kebidanan
              </p>
            </div>
          </div>
          <Link
            href="/login"
            data-motion-intro-child
            className="motion-underline inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Masuk
            <ArrowRight className="motion-arrow h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-slate-200 bg-white">
          {/* Depth layer 1 (background) — slowest movement */}
          <div
            aria-hidden="true"
            data-motion-pointer
            data-motion-depth="0.35"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_70%_-10%,rgba(37,99,235,0.07),transparent)]"
          />
          {/* Depth layer 2 (midground decoration) — moderate movement */}
          <div
            aria-hidden="true"
            data-motion-pointer
            data-motion-depth="0.7"
            className="pointer-events-none absolute -left-16 top-24 h-64 w-64 rounded-full bg-blue-100/40 blur-2xl sm:h-80 sm:w-80"
          />
          {/* Depth layer 3 (foreground decoration) — stronger movement */}
          <div
            aria-hidden="true"
            data-motion-pointer
            data-motion-depth="1.25"
            className="pointer-events-none absolute right-10 top-16 hidden h-40 w-40 rounded-full border border-slate-200/70 bg-white/50 backdrop-blur-sm lg:block"
          />

          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-20 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
            <div data-motion-parallax data-motion-pointer data-motion-depth="0.45">
              <p
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                data-motion-intro-child
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Sistem Internal · Rumah Sakit Adhyaksa Jawa Timur
              </p>

              <h1
                data-motion-intro="headline"
                data-motion-scene-exit
                className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl"
              >
                Sistem Informasi Manajemen
                <span className="block text-slate-500">Keperawatan &amp; Kebidanan</span>
              </h1>

              <p
                className="mt-6 max-w-xl text-base leading-relaxed text-slate-600"
                data-motion-intro-child
              >
                MYSIMNUSA menyatukan pengelolaan Komite Keperawatan, Borang, dan Diklat
                dalam satu platform terpadu — akurat, tertelusur, dan akuntabel untuk
                mendukung mutu pelayanan.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row" data-motion-intro-child>
                <Link
                  href="/login"
                  data-motion-magnetic
                  className="motion-underline inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-6 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Masuk ke MYSIMNUSA
                  <ArrowRight className="motion-arrow h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="#modul"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-6 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                >
                  Lihat Modul
                </Link>
              </div>
            </div>

            {/* Capability panel */}
            <div
              className="rounded-xl border border-slate-200 bg-slate-50/60 p-6 shadow-sm"
              data-motion-reveal
              data-motion-pointer
              data-motion-depth="0.9"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Fondasi sistem
              </p>
              <dl className="mt-5 space-y-4">
                {capabilities.map((cap) => (
                  <div key={cap.label} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-blue-600">
                      <cap.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <dt className="text-sm font-semibold text-slate-800">{cap.label}</dt>
                      <dd className="text-xs leading-relaxed text-slate-500">{cap.detail}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* Modules */}
        <section id="modul" className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900" data-motion-lines>
              Modul Terpadu
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Tiga modul inti yang saling terhubung, dengan data SDM sebagai fondasi bersama.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((module) => (
              <article
                key={module.title}
                data-motion-reveal
                className="group flex flex-col rounded-lg border border-slate-200 bg-white p-5 transition-colors duration-150 hover:border-slate-300"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                  <module.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {module.tag}
                </p>
                <h3 className="mt-1 text-sm font-semibold text-slate-900">{module.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{module.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Closing band */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-6 py-14 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Siap digunakan oleh tenaga keperawatan &amp; kebidanan
              </h2>
              <p className="mt-1.5 text-sm text-slate-600">
                Akses terbatas untuk pengguna terdaftar dengan peran dan hak akses yang ditetapkan.
              </p>
            </div>
            <Link
              href="/login"
              data-motion-magnetic
              className="motion-underline inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-blue-600 px-6 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Masuk ke MYSIMNUSA
              <ArrowRight className="motion-arrow h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-slate-50">
        <div
          className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"
          data-motion-footer
        >
          <p>Rumah Sakit Adhyaksa Jawa Timur · Sistem Internal</p>
          <p>
            © {new Date().getFullYear()} MYSIMNUSA — Sistem Informasi Manajemen Keperawatan &amp; Kebidanan
          </p>
        </div>
      </footer>
    </div>
  );
}
