import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import "./scroll-story.css";
import {
  ArrowRight,
  Activity,
  ClipboardCheck,
  BadgeCheck,
} from "lucide-react";

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

/**
 * Scene content for the two cinematic text sections.
 * Each scene: a small uppercase label (only on the first scene) + a big line.
 * `accent` words inside a line are wrapped in <em> for a blue highlight.
 */
const SECTION_SCENES = [
  {
    id: "sumber-data",
    label: "Satu Sumber Data",
    video: 2,
    scenes: [
      "Data tenaga keperawatan, tidak lagi tersebar.",
      "Satu platform untuk Komite Keperawatan, Borang, dan Diklat.",
      "Akurat. Tertelusur. Akuntabel.",
    ],
  },
  {
    id: "mutu-pelayanan",
    label: "Mutu Pelayanan",
    video: 3,
    scenes: [
      "Setiap pengajuan terverifikasi.",
      "Pemantauan STR, SIP, dan kompetensi otomatis.",
      "Untuk pelayanan yang lebih bermutu.",
    ],
  },
];

export default function Home() {
  return (
    <div className="story-page flex min-h-screen flex-col bg-slate-950 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
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
        {/* Hero — sticky section with looping background video. Elements reveal
            one-by-one on scroll (see /scroll-story.js). */}
        <section
          id="hero"
          data-story
          className="story-hero relative bg-slate-950"
        >
          <div className="story__sticky">
            {/* Background video (loops, never scroll-controlled) */}
            <div className="story__media" aria-hidden="true">
              <video
                className="story__video"
                data-video="1"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster="/assets/poster-1.webp"
              >
                <source src="/assets/video-1.webm" type="video/webm" />
                <source src="/assets/video-1.mp4" type="video/mp4" />
              </video>
              <div className="story__overlay" data-overlay-tone="navy" />
            </div>

            <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-20 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
              <div data-parallax data-speed="1.05">
                <p
                  data-hero-step
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                  Sistem Internal · Rumah Sakit Adhyaksa Jawa Timur
                </p>

                <h1
                  data-hero-step
                  className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl"
                >
                  Sistem Informasi Manajemen
                  <span className="block text-white/70">Keperawatan &amp; Kebidanan</span>
                </h1>

                <p
                  data-hero-step
                  className="mt-6 max-w-xl text-base leading-relaxed text-white/80"
                >
                  MYSIMNUSA menyatukan pengelolaan Komite Keperawatan, Borang, dan Diklat
                  dalam satu platform terpadu — akurat, tertelusur, dan akuntabel untuk
                  mendukung mutu pelayanan.
                </p>

                <div data-hero-step className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/login"
                    className="motion-underline inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-6 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    Masuk ke MYSIMNUSA
                    <ArrowRight className="motion-arrow h-4 w-4" aria-hidden="true" />
                  </Link>
                  <a
                    href="#sumber-data"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/30 bg-white/10 px-6 text-sm font-medium text-white backdrop-blur transition-colors duration-150 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
                  >
                    Lihat Selengkapnya
                  </a>
                </div>
              </div>

              {/* Capability panel — glass card over the video */}
              <div
                data-hero-step
                data-parallax
                data-speed="0.9"
                className="story-glass rounded-xl border border-white/15 p-6 shadow-lg"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-white/70">
                  Fondasi sistem
                </p>
                <dl className="mt-5 space-y-4">
                  {capabilities.map((cap) => (
                    <div key={cap.label} data-hero-item className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/10 text-blue-200">
                        <cap.icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div>
                        <dt className="text-sm font-semibold text-white">{cap.label}</dt>
                        <dd className="text-xs leading-relaxed text-white/70">{cap.detail}</dd>
                      </div>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* Sections 2 & 3 — cinematic text scenes over their own looping video.
            No cards: just a small label + a big line per scene, revealed in
            sequence with parallax (see /scroll-story.js). */}
        {SECTION_SCENES.map((section, si) => (
          <section
            key={section.id}
            id={section.id}
            data-story
            data-scene-section
            className="story-scene-section"
          >
            <div className="story__sticky">
              <div className="story__media" aria-hidden="true">
                <video
                  className="story__video"
                  data-video={String(section.video)}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster={`/assets/poster-${section.video}.webp`}
                >
                  <source src={`/assets/video-${section.video}.webm`} type="video/webm" />
                  <source src={`/assets/video-${section.video}.mp4`} type="video/mp4" />
                </video>
                <div className="story__overlay" data-overlay-tone={si === 0 ? "blue" : "teal"} />
              </div>

              {/* Progress marker (right edge): counter + vertical ticks. */}
              <div className="story__progress" aria-hidden="true">
                <span className="story__counter">
                  <span data-scene-current>01</span> / {String(section.scenes.length).padStart(2, "0")}
                </span>
                <span className="story__ticks">
                  {section.scenes.map((line, i) => (
                    <span key={line} className="story__tick" data-scene-tick={i} />
                  ))}
                </span>
              </div>

              <div className="story__scenes">
                {section.scenes.map((line, i) => (
                  <div key={line} className="story__scene" data-scene={i}>
                    {i === 0 && <p className="story__scene-label">{section.label}</p>}
                    <p className="story__scene-line" data-scene-line data-speed={String(1 + i * 0.04)}>
                      {line}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* CTA — light section. Its top edge blends from the dark video band. */}
        <section className="story-cta relative bg-white">
          <div className="story-cta__fade" aria-hidden="true" />
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

      {/* Vanilla scroll-story behaviour (progress, reveal, parallax, video pause). */}
      <Script src="/scroll-story.js" strategy="afterInteractive" />
    </div>
  );
}

