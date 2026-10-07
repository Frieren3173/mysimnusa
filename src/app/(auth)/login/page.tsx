import type { Metadata } from "next";
import Image from "next/image";
import Script from "next/script";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ShieldCheck, Lock, Users, FileText, GraduationCap } from "lucide-react";
import "./login-slideshow.css";

export const metadata: Metadata = { title: "Masuk" };

const highlights = [
  { icon: Users, label: "Komite Keperawatan" },
  { icon: FileText, label: "Borang & Dokumentasi" },
  { icon: GraduationCap, label: "Diklat & Kompetensi" },
];

// First slideshow photo — preloaded so the hero paints immediately.
const FIRST_SLIDE = "/assets/login/01.webp";

export default async function LoginPage() {
  // Redirect if already logged in
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="login-shell">
      {/* Preload only the first slide so the hero paints immediately. */}
      <link rel="preload" as="image" href={FIRST_SLIDE} />
      {/* ── Left panel — photo slideshow + brand overlay ─────────────────── */}
      <aside className="login-hero" data-login-hero aria-label="Panel brand">
        {/* Slideshow layer (photos are decorative → aria-hidden) */}
        <div className="hero-slides" aria-hidden="true">
          <div className="slide" data-slide="static" style={{ backgroundImage: `url(${FIRST_SLIDE})` }} />
        </div>

        {/* Gradient + vignette overlay for text legibility */}
        <div className="hero-overlay" aria-hidden="true" />
        <div className="hero-vignette" aria-hidden="true" />

        {/* Brand content (kept above the slideshow) */}
        <div className="hero-content">
          <div className="relative flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white">
              <Image
                src="/logo-rsajt.png"
                alt="Logo Rumah Sakit Adhyaksa Jawa Timur"
                width={1430}
                height={721}
                priority
                className="h-7 w-auto"
              />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight text-white">MYSIMNUSA</p>
              <p className="text-[11px] leading-tight text-slate-300">
                Manajemen Keperawatan &amp; Kebidanan
              </p>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
              Sistem Informasi Manajemen
              <span className="block text-slate-300">Keperawatan &amp; Kebidanan</span>
            </h1>
            <p className="mt-5 text-sm leading-relaxed text-slate-300">
              Platform internal untuk pengelolaan data tenaga keperawatan, legalitas,
              borang, dan diklat secara terpadu dan tertelusur.
            </p>

            <ul className="mt-8 space-y-3">
              {highlights.map((item) => (
                <li key={item.label} className="flex items-center gap-3 text-sm text-slate-200">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-white/10 text-blue-200">
                    <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Rumah Sakit Adhyaksa Jawa Timur · Sistem Internal
          </p>
        </div>

        {/* Slideshow progress dots (thin, bottom-left) */}
        <div className="hero-dots" data-hero-dots aria-hidden="true" />
      </aside>

      {/* ── Right panel — login form ─────────────────────────────────────── */}
      <main className="login-panel">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="mb-8 flex items-center gap-3 min-[900px]:hidden">
            <Image
              src="/logo-rsajt.png"
              alt="Logo Rumah Sakit Adhyaksa Jawa Timur"
              width={1430}
              height={721}
              priority
              className="h-9 w-auto"
            />
            <div className="border-l border-slate-200 pl-3">
              <p className="text-sm font-semibold leading-tight text-slate-900">MYSIMNUSA</p>
              <p className="text-[10px] leading-tight text-slate-500">
                Manajemen Keperawatan &amp; Kebidanan
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Masuk ke MYSIMNUSA</h2>
              <p className="mt-1 text-sm text-slate-500">
                Gunakan akun yang diberikan oleh administrator.
              </p>
            </div>

            {/* LoginForm is imported at the bottom to keep this a server component */}
            <LoginFormSlot />
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Koneksi terenkripsi · Akses terbatas pengguna terdaftar
          </p>
        </div>
      </main>

      {/* Slideshow behaviour (crossfade + Ken Burns). Vanilla JS. */}
      <Script src="/login-slideshow.js" strategy="afterInteractive" />
    </div>
  );
}

// Client form component
import LoginFormSlot from "./login-form";
