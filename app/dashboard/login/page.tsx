"use client";

import { FormEvent, useState } from "react";

export default function DashboardLoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/dashboard/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string; redirectTo?: string };

    if (!response.ok) {
      setError(data.message ?? "بيانات الدخول غير صحيحة");
      setLoading(false);
      return;
    }

    window.location.href = data.redirectTo ?? "/dashboard";
  }

  return (
    <main className="min-h-screen bg-salon-ink px-5 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <p className="mb-3 text-sm font-semibold text-salon-gold">لوحة الإدارة</p>
        <h1 className="text-4xl font-bold">تسجيل دخول المدير</h1>
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-lg border border-white/10 bg-white p-5 text-salon-ink shadow-2xl">
          <label className="block text-sm font-semibold">
            البريد الإلكتروني
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-2 w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold"
            />
          </label>
          <label className="block text-sm font-semibold">
            كلمة المرور
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-2 w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold"
            />
          </label>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-salon-gold px-4 py-3 font-bold text-salon-ink transition hover:brightness-95 disabled:opacity-60"
          >
            {loading ? "جاري الدخول..." : "دخول"}
          </button>
        </form>
      </section>
    </main>
  );
}
