"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { FormField } from "@/components/ui/form";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";

interface LoginState {
  error?: string;
  loading: boolean;
}

export default function LoginForm() {
  const router = useRouter();
  const [state, setState] = React.useState<LoginState>({ loading: false });
  const [errors, setErrors] = React.useState<{ username?: string; password?: string }>({});
  const [showPassword, setShowPassword] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const username = data.get("username") as string;
    const password = data.get("password") as string;

    // Client-side validation
    const newErrors: typeof errors = {};
    if (!username.trim()) newErrors.username = "Username wajib diisi";
    if (!password) newErrors.password = "Password wajib diisi";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setState({ loading: true });
    setErrors({});

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setState({ loading: false, error: json.error?.message ?? "Login gagal" });
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setState({ loading: false, error: "Terjadi kesalahan. Coba lagi." });
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormField
        label="Username"
        htmlFor="username"
        required
        error={errors.username}
      >
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoFocus
          placeholder="Masukkan username"
          error={!!errors.username}
          disabled={state.loading}
        />
      </FormField>

      <FormField
        label="Password"
        htmlFor="password"
        required
        error={errors.password}
      >
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Masukkan password"
            error={!!errors.password}
            disabled={state.loading}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            aria-pressed={showPassword}
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </FormField>

      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={state.loading}
        className="w-full"
      >
        {state.loading ? "Memproses…" : "Masuk"}
      </Button>
    </form>
  );
}
