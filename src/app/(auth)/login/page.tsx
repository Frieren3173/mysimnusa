import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage() {
  // Redirect if already logged in
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 flex-col justify-between p-12">
        <div>
          <div className="inline-flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">RS</span>
            </div>
            <span className="text-white font-semibold text-sm">RSAJT</span>
          </div>
        </div>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-white leading-tight">
            Nursing Management System
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed max-w-md">
            Platform terintegrasi untuk Komite Keperawatan, Borang, dan Diklat.
            Mengelola data SDM Perawat dan Bidan secara profesional.
          </p>
        </div>
        <p className="text-slate-600 text-xs">
          Rumah Sakit Al-Jihad Tangerang · Sistem Internal
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile brand */}
          <div className="lg:hidden text-center">
            <div className="inline-flex items-center gap-2 mb-6">
              <div className="h-8 w-8 rounded-md bg-blue-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">RS</span>
              </div>
              <span className="text-slate-900 font-semibold text-sm">RSAJT</span>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-900">Masuk ke Sistem</h2>
            <p className="text-sm text-slate-500 mt-1">
              Gunakan akun yang diberikan oleh administrator.
            </p>
          </div>

          <LoginForm />

          <p className="text-xs text-slate-400 text-center">
            Lupa akses? Hubungi administrator sistem.
          </p>
        </div>
      </div>
    </div>
  );
}

// Client form component
import LoginForm from "./login-form";
