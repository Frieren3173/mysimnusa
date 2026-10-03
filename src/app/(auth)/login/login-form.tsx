"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { FormField } from "@/components/ui/form";

interface LoginState {
  error?: string;
  loading: boolean;
}

export default function LoginForm() {
  const router = useRouter();
  const [state, setState] = React.useState<LoginState>({ loading: false });
  const [errors, setErrors] = React.useState<{ username?: string; password?: string }>({});

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
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Masukkan password"
          error={!!errors.password}
          disabled={state.loading}
        />
      </FormField>

      {state.error && (
        <div
          role="alert"
          className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={state.loading}
        className="w-full"
      >
        {state.loading ? "Memproses..." : "Masuk"}
      </Button>
    </form>
  );
}
