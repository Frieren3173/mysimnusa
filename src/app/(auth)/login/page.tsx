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
      {/* ── Left panel — full-bleed photo slideshow (logo + small footer only) ── */}
      <aside className="login-hero" data-login-hero aria-label="Panel brand">
        {/* Slideshow layer (photos decorative → aria-hidden) */}
        <div className="hero-slides" aria-hidden="true">
          <div
            className="slide"
            data-slide="static"
            style={{ backgroundImage: `url(${FIRST_SLIDE})` }}
          />
        </div>

        {/* Light top/bottom navy gradient (logo + footer legibility) + vignette */}
        <div className="hero-overlay" aria-hidden="true" />
        <div className="hero-vignette" aria-hidden="true" />

        {/* Minimal brand chrome over the photo */}
        <div className="hero-chrome">
          <div className="flex items-center gap-3">
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
              <p className="text-[11px] leading-tight text-slate-200">
                Manajemen Keperawatan &amp; Kebidanan
              </p>
            </div>
          </div>

          <p className="flex items-center gap-2 text-xs text-slate-300">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Rumah Sakit Adhyaksa Jawa Timur · Sistem Internal
          </p>
        </div>

        {/* Slideshow progress dots (thin, bottom-left) */}
        <div className="hero-dots" data-hero-dots aria-hidden="true" />
      </aside>

      {/* ── Right panel — identity block + login form ─────────────────────── */}
      <main className="login-panel">
        <div className="login-panel__inner w-full max-w-sm">
          {/* Mobile brand */}
          <div className="mb-6 flex items-center gap-3 min-[900px]:hidden">
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

          {/* Identity block (moved from the left panel) */}
          <header className="login-intro">
            <h1 className="login-intro__title">
              Sistem Informasi Manajemen{" "}
              <span className="block text-slate-500">Keperawatan &amp; Kebidanan</span>
            </h1>
            <p className="login-intro__desc">
              Platform internal untuk pengelolaan data tenaga keperawatan, legalitas,
              borang, dan diklat secara terpadu dan tertelusur.
            </p>

            <ul className="login-chips" aria-label="Cakupan sistem">
              {highlights.map((item) => (
                <li key={item.label} className="login-chip">
                  <item.icon className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </header>

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
